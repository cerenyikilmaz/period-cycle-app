-- Run in Supabase SQL Editor. Only authenticated users can manage their own subscriptions.
create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique,
 subscription jsonb not null,
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy "own push read" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own push insert" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own push update" on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own push delete" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);
-- Sending requires a server-side scheduled job, VAPID private key and service-role key stored ONLY in server environment.
-- Compute reminders using users' own timezone and actual cycle history; avoid sending duplicates.
