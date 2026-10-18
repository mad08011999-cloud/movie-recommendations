-- =====================================================================
-- Recommendations backend for movie-recommendations
-- 1) public.catalog_titles  : searchable/feature table (synced daily from the site + live from user_titles)
-- 2) recommend_for_user()   : taste-profile recommender (SECURITY INVOKER, uses auth.uid())
-- 3) pg_cron + pg_net       : daily call to the 'sync-catalog' Edge Function (secret header from Vault)
-- Run once in the SQL editor. Re-runnable.
-- =====================================================================

-- ---------- 1. catalog_titles ----------
create table if not exists public.catalog_titles (
  id           text primary key check (id ~ '^tt[0-9]{6,10}$'),
  title        text not null,
  type         text not null check (type in ('movie','series')),
  year         int,
  decade       int generated always as ((year / 10) * 10) stored,
  language     text,
  genres       text[] not null default '{}',
  directors    text[] not null default '{}',
  cast_names   text[] not null default '{}',
  imdb_rating  numeric(3,1),
  rt_score     int,
  popularity   int not null default 0,          -- saves in the source collection
  poster       text,
  streaming    jsonb not null default '{}'::jsonb, -- {"home":["netflix",...],"countries":["US",...],"els":{"netflix":["DE"]}}
  source       text,
  from_user    boolean not null default false,  -- row maintained by the user_titles trigger
  updated_at   timestamptz not null default now()
);
create index if not exists catalog_titles_genres_gin    on public.catalog_titles using gin (genres);
create index if not exists catalog_titles_directors_gin on public.catalog_titles using gin (directors);
create index if not exists catalog_titles_cast_gin      on public.catalog_titles using gin (cast_names);
create index if not exists catalog_titles_lang_idx      on public.catalog_titles (language);
create index if not exists catalog_titles_type_dec_idx  on public.catalog_titles (type, decade);
create index if not exists catalog_titles_quality_idx   on public.catalog_titles (imdb_rating desc nulls last);

alter table public.catalog_titles enable row level security;
drop policy if exists "public read catalog titles" on public.catalog_titles;
create policy "public read catalog titles" on public.catalog_titles for select to anon, authenticated using (true);
revoke insert, update, delete on public.catalog_titles from anon, authenticated;
grant select on public.catalog_titles to anon, authenticated;

-- watch_status lookups by user (probably exists via the PK (user_id, title_id); harmless if duplicated)
create index if not exists watch_status_user_idx on public.watch_status (user_id);

-- ---------- live sync of user-added titles (no Edge Function needed) ----------
create or replace function public.catalog_titles_from_user_titles() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; s jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.catalog_titles where id = old.id and from_user;
    return old;
  end if;
  r := new.record; s := coalesce(r->'stream', '{}'::jsonb);
  insert into public.catalog_titles as c (id, title, type, year, language, genres, directors, cast_names, imdb_rating, rt_score,
                                          popularity, poster, streaming, source, from_user, updated_at)
  values (new.id, coalesce(r->>'title', new.id), case when r->>'type' = 'series' then 'series' else 'movie' end,
          nullif(r->>'year','')::int, initcap(nullif(r->>'language','')),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(r->'genres','[]')) x), '{}'),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(s->'director','[]')) x), '{}'),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(s->'cast','[]')) x), '{}'),
          nullif(r->>'imdbRating','')::numeric, nullif(r->>'rtScore','')::int, 0, r->>'poster',
          jsonb_build_object('countries', coalesce((select jsonb_agg(k) from jsonb_object_keys(coalesce(s->'c','{}')) k), '[]'::jsonb),
                             'els', coalesce(s->'els', '{}'::jsonb)),
          coalesce(r->>'source', new.display_name || '''s pick'), true, now())
  on conflict (id) do update set title = excluded.title, type = excluded.type, year = excluded.year, language = excluded.language,
     genres = excluded.genres, directors = excluded.directors, cast_names = excluded.cast_names, imdb_rating = excluded.imdb_rating,
     rt_score = excluded.rt_score, poster = excluded.poster, streaming = excluded.streaming, source = excluded.source, updated_at = now()
  where c.from_user;   -- never overwrite a base-catalog row
  return new;
end $$;

drop trigger if exists user_titles_to_catalog on public.user_titles;
create trigger user_titles_to_catalog after insert or update or delete on public.user_titles
  for each row execute function public.catalog_titles_from_user_titles();

-- backfill user titles that already exist
update public.user_titles set record = record;

-- ---------- 2. recommender ----------
-- Taste profile: love=+2, like=+1, dislike=-2, watched/watching (unrated)=+0.5, to-watch=+0.3.
-- Features: genres, language, directors, cast, decade, type. Blended with IMDb/RT quality, popularity and a
-- per-genre diversity penalty. Excludes anything already in the user's list (any status or rating).
create or replace function public.recommend_for_user(p_limit int default 60, p_type text default null)
returns table (id text, score numeric, because_id text, because_title text, reasons text[])
language sql stable security invoker set search_path = public as $$
with me as (select auth.uid() as uid),
mine as (
  select w.title_id, w.status, w.rating,
         case w.rating when 'love' then 2.0 when 'like' then 1.0 when 'dislike' then -2.0
              else case w.status when 'watched' then 0.5 when 'watching' then 0.5 else 0.3 end end::numeric as wgt
  from public.watch_status w, me where w.user_id = me.uid
),
rated as (select c.*, m.wgt from mine m join public.catalog_titles c on c.id = m.title_id),
g  as (select x as k, sum(wgt) / sqrt(count(*)) as w from rated, unnest(genres) x group by x),
l  as (select language as k, sum(wgt) / sqrt(count(*)) as w from rated where language is not null group by language),
d  as (select x as k, sum(wgt) as w from rated, unnest(directors) x group by x),
ca as (select x as k, sum(wgt) as w from rated, unnest(cast_names[1:6]) x group by x),
de as (select decade as k, sum(wgt) / sqrt(count(*)) as w from rated where decade is not null group by decade),
ty as (select type as k, sum(wgt) / sqrt(count(*)) as w from rated group by type),
pos as (select
          coalesce(array_agg(k) filter (where w > 0), '{}') as gpos from g),
posd as (select coalesce(array_agg(k) filter (where w > 0), '{}') as dpos from d),
posc as (select coalesce(array_agg(k) filter (where w > 0), '{}') as cpos from ca),
cand as (   -- GIN-friendly prefilter: share a liked genre / director / cast member
  select c.* from public.catalog_titles c, pos, posd, posc
  where (p_type is null or c.type = p_type)
    and not exists (select 1 from mine m where m.title_id = c.id)
    and (c.genres && pos.gpos or c.directors && posd.dpos or c.cast_names && posc.cpos)
),
scored as (
  select c.id, c.title, c.genres, c.language, c.directors, c.cast_names,
    coalesce((select sum(g.w) from g where g.k = any(c.genres)), 0) / greatest(sqrt(cardinality(c.genres)), 1) * 1.0
    + coalesce((select l.w from l where l.k = c.language), 0) * 0.6
    + coalesce((select sum(d.w) from d where d.k = any(c.directors)), 0) * 1.2
    + least(coalesce((select sum(ca.w) from ca where ca.k = any(c.cast_names[1:8])), 0), 4) * 0.4
    + coalesce((select de.w from de where de.k = c.decade), 0) * 0.25
    + coalesce((select ty.w from ty where ty.k = c.type), 0) * 0.3
    + (coalesce(c.imdb_rating, 6.5) - 6.5) * 0.35
    + (coalesce(c.rt_score, 60) - 60) / 100.0
    + ln(1 + c.popularity) * 0.08 as s,
    coalesce(c.genres[1], 'Other') as g1
  from cand c
),
diverse as (
  select s.*, s.s - 0.12 * (row_number() over (partition by s.g1 order by s.s desc) - 1) as fs
  from scored s where s.s > 0
),
top as (select * from diverse order by fs desc limit greatest(least(p_limit, 300), 1))
select t.id, round(t.fs::numeric, 3) as score, b.id as because_id, b.title as because_title,
  array_remove(array[
    (select 'Genres: ' || string_agg(x, ', ') from (select x from unnest(t.genres) x join g on g.k = x and g.w > 0 limit 3) q),
    (select 'Director: ' || string_agg(x, ', ') from (select x from unnest(t.directors) x join d on d.k = x and d.w > 0 limit 2) q),
    (select 'With ' || string_agg(x, ', ') from (select x from unnest(t.cast_names[1:8]) x join ca on ca.k = x and ca.w > 0 limit 2) q),
    (select t.language from l where l.k = t.language and l.w > 0.5 and t.language <> 'English')
  ], null) as reasons
from top t
left join lateral (   -- the loved/liked title it most resembles
  select r.id, r.title from rated r
  where r.wgt >= 1
  order by (cardinality(array(select unnest(r.genres) intersect select unnest(t.genres)))
          + 3 * cardinality(array(select unnest(r.directors) intersect select unnest(t.directors)))
          + cardinality(array(select unnest(r.cast_names[1:8]) intersect select unnest(t.cast_names[1:8])))
          + case when r.language = t.language then 1 else 0 end) desc, r.wgt desc
  limit 1
) b on true
order by t.fs desc;
$$;
revoke all on function public.recommend_for_user(int, text) from public, anon;
grant execute on function public.recommend_for_user(int, text) to authenticated;

-- ---------- 3. daily sync via pg_cron + pg_net ----------
create extension if not exists pg_net;
create extension if not exists pg_cron;
-- Store the shared secret once (choose your own long random string; set the SAME value as the
-- Edge Function secret SYNC_SECRET):
--   select vault.create_secret('<your-long-random-string>', 'sync_catalog_secret');
select cron.unschedule('sync-catalog-daily') where exists (select 1 from cron.job where jobname = 'sync-catalog-daily');
select cron.schedule('sync-catalog-daily', '30 15 * * *',   -- 15:30 UTC, after the 14:00 UTC GitHub Action + Pages deploy
$cron$
  select net.http_post(
    url     := 'https://mazrqepjgdtdraxpcptk.supabase.co/functions/v1/sync-catalog',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_catalog_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
$cron$);

-- Optional later: pgvector item embeddings (create extension vector; add embedding vector(384)) for
-- semantic "more like this" — not needed for the current profile-based recommender.
