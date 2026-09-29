-- Demo database only (PGlite). Recreates the small part of Supabase the migrations rely on:
-- the `anon` / `authenticated` roles, the `auth.users` table and `auth.uid()`.
-- On Supabase these already exist, so this file is never run there.
-- Safe to run more than once.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  email varchar(255),
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- Same definition Supabase uses: the signed-in user's id from the request's JWT claims.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Sign-in codes for the demo "text message" (Supabase Auth keeps its own when it takes over).
create schema if not exists demo;

create table if not exists demo.verification_codes (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  sent_in_window integer not null default 1
);
