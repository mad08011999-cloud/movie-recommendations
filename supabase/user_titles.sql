-- Titles added by signed-in users via the 'add-title' Edge Function.
create table if not exists public.user_titles (
  id            text primary key check (id ~ '^tt[0-9]{6,10}$'),   -- IMDb id (same key as catalog / watch_status.title_id)
  record        jsonb not null,                                    -- full enriched catalog record (+ "stream" details)
  added_by      uuid references auth.users(id) on delete set null,
  display_name  text check (display_name is null or char_length(display_name) <= 60),
  created_at    timestamptz not null default now()
);
create index if not exists user_titles_added_by_idx on public.user_titles (added_by, created_at desc);

alter table public.user_titles enable row level security;

-- Anyone (signed in or not) can read user-added titles so they appear on the public site.
drop policy if exists "public read user titles" on public.user_titles;
create policy "public read user titles" on public.user_titles
  for select to anon, authenticated using (true);

-- No insert/update/delete policies: only the Edge Function (service role, bypasses RLS) writes.
revoke insert, update, delete on public.user_titles from anon, authenticated;
grant select on public.user_titles to anon, authenticated;
