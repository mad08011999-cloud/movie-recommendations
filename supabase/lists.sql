-- Named watch lists per user for the 3D store's "ADD TO A LIST" panel.
-- Run once in Supabase → SQL Editor. Safe to re-run.

create table if not exists public.user_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists user_lists_user_idx on public.user_lists (user_id, created_at);

create table if not exists public.list_items (
  list_id   uuid not null references public.user_lists(id) on delete cascade,
  title_id  text not null check (char_length(title_id) between 1 and 32),
  added_at  timestamptz not null default now(),
  primary key (list_id, title_id)
);
create index if not exists list_items_title_idx on public.list_items (title_id);

alter table public.user_lists enable row level security;
alter table public.list_items enable row level security;

-- user_lists: each user sees and edits only their own lists
drop policy if exists "own lists select" on public.user_lists;
drop policy if exists "own lists insert" on public.user_lists;
drop policy if exists "own lists update" on public.user_lists;
drop policy if exists "own lists delete" on public.user_lists;
create policy "own lists select" on public.user_lists for select to authenticated using (user_id = auth.uid());
create policy "own lists insert" on public.user_lists for insert to authenticated with check (user_id = auth.uid());
create policy "own lists update" on public.user_lists for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own lists delete" on public.user_lists for delete to authenticated using (user_id = auth.uid());

-- list_items: allowed only inside a list the user owns
drop policy if exists "own list items select" on public.list_items;
drop policy if exists "own list items insert" on public.list_items;
drop policy if exists "own list items delete" on public.list_items;
create policy "own list items select" on public.list_items for select to authenticated
  using (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "own list items insert" on public.list_items for insert to authenticated
  with check (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy "own list items delete" on public.list_items for delete to authenticated
  using (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()));

revoke all on public.user_lists, public.list_items from anon;
grant select, insert, update, delete on public.user_lists to authenticated;
grant select, insert, delete on public.list_items to authenticated;
