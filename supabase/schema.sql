-- My Cycle / Supabase PostgreSQL bootstrap schema
-- IMPORTANT: Intended for a NEW, EMPTY Supabase project only.
-- This schema is derived from frontend and reminder Worker queries.
-- It is NOT a verified export of the existing production database.
-- Do not execute against the current production project without reviewing differences.
--
-- Security design:
--   authenticated users can access only their own profiles, periods and push subscriptions
--   delivery log has no user-facing RLS policies; reminder Worker uses service_role
--   service_role key must never be used in the browser

begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cycle_length integer not null default 28 check (cycle_length > 0),
  period_length integer not null default 5 check (period_length > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.periods (
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  primary key (user_id, start_date)
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  enabled boolean not null default true
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

create table if not exists public.push_delivery_log (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  predicted_date date not null
);

create index if not exists push_delivery_log_user_id_idx
  on public.push_delivery_log(user_id);

alter table public.profiles enable row level security;
alter table public.periods enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_log enable row level security;

-- Access grants and RLS are separate controls.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.periods to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_delivery_log from anon, authenticated;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "periods_select_own" on public.periods
  for select to authenticated using (user_id = (select auth.uid()));
create policy "periods_insert_own" on public.periods
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "periods_update_own" on public.periods
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "periods_delete_own" on public.periods
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "subscriptions_update_own" on public.push_subscriptions
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

commit;

-- New-project smoke tests:
-- 1. Sign up two users in Supabase Auth.
-- 2. With user A JWT, insert profile and period A; with user B JWT, A's rows must be invisible.
-- 3. Verify user A cannot insert a row with user B's user_id.
-- 4. Enable push from PWA; check subscription upsert(onConflict:'endpoint').
-- 5. Verify authenticated users cannot read/write push_delivery_log.
-- 6. Run reminder Worker with service_role and inspect cron logs.
