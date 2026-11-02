create table if not exists public.push_delivery_log (
 id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 predicted_date date not null,
 sent_at timestamptz not null default now()
);
alter table public.push_delivery_log enable row level security;
-- No browser-facing policies. Only the server's service-role can access this log.
