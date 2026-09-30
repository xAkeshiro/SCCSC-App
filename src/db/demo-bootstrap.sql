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

-- One sign-in account per email, as on Supabase. A person's account can have both an email and a phone.
create unique index if not exists users_email_key on auth.users (email);

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

-- Sign-in codes made by the app for the demo (Supabase Auth keeps its own when it takes over).
-- `contact` is the email or phone (E.164) they were sent for, or `limit:…` for send limits.
create schema if not exists demo;

do $$
begin
  -- Databases made before email sign-in keyed codes by phone only.
  if exists (select 1 from information_schema.columns
             where table_schema = 'demo' and table_name = 'verification_codes' and column_name = 'phone') then
    alter table demo.verification_codes rename column phone to contact;
  end if;
end
$$;

create table if not exists demo.verification_codes (
  contact text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  sent_in_window integer not null default 1
);
