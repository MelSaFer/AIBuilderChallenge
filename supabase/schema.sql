-- Mise: database tables for user accounts.
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.

-- Everything the app also keeps in the browser, one row per user and key.
create table if not exists public.user_data (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key in ('pantry', 'basics', 'shopping', 'settings', 'plan', 'planRecipes')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint user_data_size check (octet_length(value::text) < 5000000)
);

-- Recipes a user saved with the heart button.
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  recipe jsonb not null check (octet_length(recipe::text) < 200000),
  created_at timestamptz not null default now(),
  unique (user_id, title)
);
create index if not exists favorites_user_created on public.favorites (user_id, created_at desc);

alter table public.user_data enable row level security;
alter table public.favorites enable row level security;

-- Each person only sees and changes their own rows.
drop policy if exists "Own data: read" on public.user_data;
drop policy if exists "Own data: add" on public.user_data;
drop policy if exists "Own data: change" on public.user_data;
drop policy if exists "Own data: delete" on public.user_data;
create policy "Own data: read" on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own data: add" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own data: change" on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own data: delete" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Own favorites: read" on public.favorites;
drop policy if exists "Own favorites: add" on public.favorites;
drop policy if exists "Own favorites: change" on public.favorites;
drop policy if exists "Own favorites: delete" on public.favorites;
create policy "Own favorites: read" on public.favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own favorites: add" on public.favorites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own favorites: change" on public.favorites for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own favorites: delete" on public.favorites for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_data, public.favorites from anon;
grant select, insert, update, delete on public.user_data, public.favorites to authenticated;
