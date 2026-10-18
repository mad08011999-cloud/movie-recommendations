-- Per-user 3D store preferences ("Your services" choices).
-- Run once in Supabase Dashboard -> SQL Editor. Safe to re-run.
create table if not exists public.user_prefs (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  services   text[] not null default '{}',
  country    text   not null default 'US' check (country ~ '^[A-Z]{2}$'),
  arrange    text   not null default 'popular' check (char_length(arrange) between 1 and 20),
  updated_at timestamptz not null default now(),
  constraint user_prefs_services_len check (coalesce(array_length(services, 1), 0) <= 60)
);

alter table public.user_prefs enable row level security;

drop policy if exists "prefs: select own" on public.user_prefs;
drop policy if exists "prefs: insert own" on public.user_prefs;
drop policy if exists "prefs: update own" on public.user_prefs;
create policy "prefs: select own" on public.user_prefs for select to authenticated using (user_id = auth.uid());
create policy "prefs: insert own" on public.user_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "prefs: update own" on public.user_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.user_prefs from anon;
revoke all on public.user_prefs from authenticated;
grant select, insert, update on public.user_prefs to authenticated;
