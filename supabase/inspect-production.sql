-- My Cycle: READ-ONLY production schema inspection
-- Run in Supabase Dashboard > SQL Editor on the CURRENT project.
-- This file does NOT modify data or configuration.
-- Share results after removing sensitive information; never share keys or user data.

-- 1) Table columns, types, defaults and nullability
select table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name in ('profiles','periods','push_subscriptions','push_delivery_log')
order by table_name, ordinal_position;

-- 2) Primary keys, foreign keys and unique constraints
select con.conrelid::regclass::text as table_name,
       con.conname as constraint_name,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_namespace n on n.oid=con.connamespace
where n.nspname='public'
  and con.conrelid::regclass::text in
      ('profiles','periods','push_subscriptions','push_delivery_log',
       'public.profiles','public.periods','public.push_subscriptions','public.push_delivery_log')
order by table_name, constraint_name;

-- 3) Indexes
select tablename, indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename in ('profiles','periods','push_subscriptions','push_delivery_log')
order by tablename, indexname;

-- 4) Row-level security state
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in ('profiles','periods','push_subscriptions','push_delivery_log')
order by tablename;

-- 5) RLS policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('profiles','periods','push_subscriptions','push_delivery_log')
order by tablename, policyname;

-- 6) Table privileges for browser-facing roles
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('profiles','periods','push_subscriptions','push_delivery_log')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;
