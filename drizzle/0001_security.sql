-- 0001_security: Row Level Security, helper functions, audited status transitions, and locks.
--
-- Runs as-is on Supabase. In demo mode, src/db/demo-bootstrap.sql first provides the pieces
-- Supabase normally supplies (roles, auth.users, auth.uid()).
--
-- The model:
--   * The app connects as the table owner and, for every signed-in request, switches to the
--     `authenticated` role with the user's id in request.jwt.claims (src/db/with-user.ts).
--     All policies below therefore apply to everything the app does on a user's behalf.
--   * Status changes happen only through the SECURITY DEFINER functions in schema `app`.
--     They check who is asking, enforce the allowed transitions, and write request_events.
--     Signed-in users have no UPDATE privilege on requests or batches at all.
--   * Trips in a submitted / approved / batched / paid claim are locked by a trigger.
--   * Each statement is separated by a breakpoint line so Drizzle's migrator can run them one by one.

create schema if not exists app;
--> statement-breakpoint
revoke all on schema app from public;
--> statement-breakpoint
grant usage on schema app to authenticated;
--> statement-breakpoint

-- =============================================================================================
-- Who is asking?
-- =============================================================================================

-- The active staff record of the signed-in user, or null.
create or replace function app.current_staff_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.staff s where s.user_id = auth.uid() and s.status = 'active'
$$;
--> statement-breakpoint

create or replace function app.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.staff s
    join public.staff_roles sr on sr.staff_id = s.id
    where s.user_id = auth.uid() and s.status = 'active' and sr.role = p_role
  )
$$;
--> statement-breakpoint

-- True when the signed-in user is a coordinator assigned to approve `p_owner`'s requests.
create or replace function app.is_coordinator_for(p_owner uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.has_role('coordinator') and exists (
    select 1 from public.staff s
    where s.id = p_owner and s.coordinator_id = app.current_staff_id()
  )
$$;
--> statement-breakpoint

-- Who may approve / return / deny `p_owner`'s requests: their coordinator, or an admin.
-- Nobody reviews their own request.
create or replace function app.can_review(p_owner uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_owner is distinct from app.current_staff_id()
     and (app.is_coordinator_for(p_owner) or app.has_role('admin'))
$$;
--> statement-breakpoint

-- The single rule for who can see a request (and, through it, its trips and history).
create or replace function app.can_view_request(p_request uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.requests r
    where r.id = p_request
      and (
        r.owner_id = app.current_staff_id()
        or (r.status <> 'draft' and (app.is_coordinator_for(r.owner_id) or app.has_role('admin')))
        or (r.status in ('approved', 'batched', 'paid') and app.has_role('finance'))
      )
  )
$$;
--> statement-breakpoint

-- Items can change only while they are not in a claim, or their claim is a draft or returned.
create or replace function app.request_editable(p_request uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_request is null
      or exists (select 1 from public.requests r where r.id = p_request and r.status in ('draft', 'returned'))
$$;
--> statement-breakpoint

create or replace function app.setting(p_key text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select s.value from public.settings s where s.key = p_key
$$;
--> statement-breakpoint

create or replace function app.require_staff() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := app.current_staff_id();
begin
  if me is null then
    raise exception 'You need to be signed in as active staff to do that.' using errcode = '42501';
  end if;
  return me;
end
$$;
--> statement-breakpoint

-- =============================================================================================
-- Privileges: start from nothing, then grant exactly what the app needs.
-- (Supabase grants everything on new tables to anon/authenticated by default.)
-- =============================================================================================

revoke all on all tables in schema public from anon, authenticated;
--> statement-breakpoint
revoke all on all sequences in schema public from anon, authenticated;
--> statement-breakpoint
grant select, insert, update, delete on public.staff, public.staff_roles, public.staff_private,
  public.programs, public.rates, public.settings, public.saved_places to authenticated;
--> statement-breakpoint
grant select on public.request_types to authenticated;
--> statement-breakpoint
grant select, insert, update on public.staff_state to authenticated;
--> statement-breakpoint
grant select, update on public.access_requests to authenticated;
--> statement-breakpoint
grant select on public.requests, public.request_events, public.batches to authenticated;
--> statement-breakpoint
grant select, insert, delete on public.request_items, public.mileage_details to authenticated;
--> statement-breakpoint
-- request_id and owner_id are deliberately not updatable: claims are formed by app.submit_claim.
grant update (item_date, purpose, program_id, notes, amount_cents, updated_at) on public.request_items to authenticated;
--> statement-breakpoint
grant update (from_place_id, from_label, from_address, from_is_home, to_place_id, to_label, to_address, to_is_home,
  stops, round_trip, miles_estimated, miles, override_reason, rate_id, rate_cents) on public.mileage_details to authenticated;
--> statement-breakpoint

-- =============================================================================================
-- Row Level Security
-- =============================================================================================

alter table public.staff enable row level security;
--> statement-breakpoint
alter table public.staff_private enable row level security;
--> statement-breakpoint
alter table public.staff_roles enable row level security;
--> statement-breakpoint
alter table public.staff_state enable row level security;
--> statement-breakpoint
alter table public.access_requests enable row level security;
--> statement-breakpoint
alter table public.programs enable row level security;
--> statement-breakpoint
alter table public.request_types enable row level security;
--> statement-breakpoint
alter table public.rates enable row level security;
--> statement-breakpoint
alter table public.settings enable row level security;
--> statement-breakpoint
alter table public.saved_places enable row level security;
--> statement-breakpoint
alter table public.batches enable row level security;
--> statement-breakpoint
alter table public.requests enable row level security;
--> statement-breakpoint
alter table public.request_items enable row level security;
--> statement-breakpoint
alter table public.mileage_details enable row level security;
--> statement-breakpoint
alter table public.request_events enable row level security;
--> statement-breakpoint

-- Staff names and roles are visible to all active staff (an internal directory).
-- Phone numbers live in staff_private, which only admins can read.
create policy staff_select on public.staff for select to authenticated
  using (user_id = auth.uid() or app.current_staff_id() is not null);
--> statement-breakpoint
create policy staff_admin_insert on public.staff for insert to authenticated
  with check (app.has_role('admin'));
--> statement-breakpoint
create policy staff_admin_update on public.staff for update to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint
create policy staff_admin_delete on public.staff for delete to authenticated
  using (app.has_role('admin'));
--> statement-breakpoint

create policy staff_private_admin on public.staff_private for all to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint

create policy staff_roles_select on public.staff_roles for select to authenticated
  using (app.current_staff_id() is not null);
--> statement-breakpoint
create policy staff_roles_admin_insert on public.staff_roles for insert to authenticated
  with check (app.has_role('admin'));
--> statement-breakpoint
create policy staff_roles_admin_update on public.staff_roles for update to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint
create policy staff_roles_admin_delete on public.staff_roles for delete to authenticated
  using (app.has_role('admin'));
--> statement-breakpoint

create policy staff_state_own on public.staff_state for all to authenticated
  using (staff_id = app.current_staff_id()) with check (staff_id = app.current_staff_id());
--> statement-breakpoint

-- People see their own access request (to show "waiting for approval"); admins see all.
-- Requests are created by the sign-in flow on the server, never directly by users.
create policy access_requests_select on public.access_requests for select to authenticated
  using (user_id = auth.uid() or app.has_role('admin'));
--> statement-breakpoint
create policy access_requests_admin_update on public.access_requests for update to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint

-- Reference data: readable by active staff, managed by admins.
create policy programs_select on public.programs for select to authenticated
  using (app.current_staff_id() is not null);
--> statement-breakpoint
create policy programs_admin_insert on public.programs for insert to authenticated
  with check (app.has_role('admin'));
--> statement-breakpoint
create policy programs_admin_update on public.programs for update to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint
create policy programs_admin_delete on public.programs for delete to authenticated
  using (app.has_role('admin'));
--> statement-breakpoint

create policy request_types_select on public.request_types for select to authenticated
  using (app.current_staff_id() is not null);
--> statement-breakpoint

create policy rates_select on public.rates for select to authenticated
  using (app.current_staff_id() is not null);
--> statement-breakpoint
create policy rates_admin_insert on public.rates for insert to authenticated
  with check (app.has_role('admin'));
--> statement-breakpoint
create policy rates_admin_update on public.rates for update to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint
create policy rates_admin_delete on public.rates for delete to authenticated
  using (app.has_role('admin'));
--> statement-breakpoint

create policy settings_select on public.settings for select to authenticated
  using (app.current_staff_id() is not null);
--> statement-breakpoint
create policy settings_admin_insert on public.settings for insert to authenticated
  with check (app.has_role('admin'));
--> statement-breakpoint
create policy settings_admin_update on public.settings for update to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint
create policy settings_admin_delete on public.settings for delete to authenticated
  using (app.has_role('admin'));
--> statement-breakpoint

-- Saved places: shared ones (owner_id null) for everyone, personal ones for their owner only.
create policy saved_places_select on public.saved_places for select to authenticated
  using ((owner_id is null and app.current_staff_id() is not null) or owner_id = app.current_staff_id());
--> statement-breakpoint
create policy saved_places_insert on public.saved_places for insert to authenticated
  with check (owner_id = app.current_staff_id() or (owner_id is null and app.has_role('admin')));
--> statement-breakpoint
create policy saved_places_update on public.saved_places for update to authenticated
  using (owner_id = app.current_staff_id() or (owner_id is null and app.has_role('admin')))
  with check (owner_id = app.current_staff_id() or (owner_id is null and app.has_role('admin')));
--> statement-breakpoint
create policy saved_places_delete on public.saved_places for delete to authenticated
  using (owner_id = app.current_staff_id() or (owner_id is null and app.has_role('admin')));
--> statement-breakpoint

-- Requests (claims): see app.can_view_request for the rule.
create policy requests_select on public.requests for select to authenticated
  using (app.can_view_request(id));
--> statement-breakpoint

create policy request_events_select on public.request_events for select to authenticated
  using (app.can_view_request(request_id));
--> statement-breakpoint

create policy batches_select on public.batches for select to authenticated
  using (
    app.has_role('finance') or app.has_role('admin')
    or exists (select 1 from public.requests r where r.batch_id = batches.id and r.owner_id = app.current_staff_id())
  );
--> statement-breakpoint

-- Items (trips): the owner, plus whoever can see the claim they are in.
create policy request_items_select on public.request_items for select to authenticated
  using (owner_id = app.current_staff_id() or (request_id is not null and app.can_view_request(request_id)));
--> statement-breakpoint
create policy request_items_insert on public.request_items for insert to authenticated
  with check (owner_id = app.current_staff_id() and request_id is null);
--> statement-breakpoint
create policy request_items_update on public.request_items for update to authenticated
  using (owner_id = app.current_staff_id() and app.request_editable(request_id))
  with check (owner_id = app.current_staff_id() and app.request_editable(request_id));
--> statement-breakpoint
create policy request_items_delete on public.request_items for delete to authenticated
  using (owner_id = app.current_staff_id() and app.request_editable(request_id));
--> statement-breakpoint

-- Mileage details hold addresses (possibly a home address), so only the owner reads the table.
-- Reviewers read trips through public.trip_view, which hides home addresses from non-owners.
create policy mileage_details_select on public.mileage_details for select to authenticated
  using (exists (select 1 from public.request_items i where i.id = item_id and i.owner_id = app.current_staff_id()));
--> statement-breakpoint
create policy mileage_details_insert on public.mileage_details for insert to authenticated
  with check (exists (
    select 1 from public.request_items i
    where i.id = item_id and i.owner_id = app.current_staff_id() and app.request_editable(i.request_id)
  ));
--> statement-breakpoint
create policy mileage_details_update on public.mileage_details for update to authenticated
  using (exists (
    select 1 from public.request_items i
    where i.id = item_id and i.owner_id = app.current_staff_id() and app.request_editable(i.request_id)
  ))
  with check (exists (
    select 1 from public.request_items i
    where i.id = item_id and i.owner_id = app.current_staff_id() and app.request_editable(i.request_id)
  ));
--> statement-breakpoint
create policy mileage_details_delete on public.mileage_details for delete to authenticated
  using (exists (
    select 1 from public.request_items i
    where i.id = item_id and i.owner_id = app.current_staff_id() and app.request_editable(i.request_id)
  ));
--> statement-breakpoint

-- =============================================================================================
-- Trips as reviewers see them: home addresses are hidden from everyone but the trip's owner.
-- The view runs with its owner's rights, so it applies the same visibility rule itself.
-- =============================================================================================

create or replace view public.trip_view as
select
  i.id,
  i.owner_id,
  i.request_id,
  i.item_date,
  i.purpose,
  i.program_id,
  i.notes,
  i.amount_cents,
  i.created_at,
  i.updated_at,
  d.from_place_id,
  d.from_label,
  case when d.from_is_home and i.owner_id is distinct from app.current_staff_id() then null else d.from_address end as from_address,
  d.from_is_home,
  d.to_place_id,
  d.to_label,
  case when d.to_is_home and i.owner_id is distinct from app.current_staff_id() then null else d.to_address end as to_address,
  d.to_is_home,
  case
    when i.owner_id = app.current_staff_id() then d.stops
    else coalesce((
      select jsonb_agg(
        case when coalesce((s ->> 'isHome')::boolean, false) then jsonb_set(s, '{address}', 'null'::jsonb) else s end
        order by ord
      )
      from jsonb_array_elements(d.stops) with ordinality as e(s, ord)
    ), '[]'::jsonb)
  end as stops,
  d.round_trip,
  d.miles_estimated,
  d.miles,
  d.override_reason,
  d.rate_id,
  d.rate_cents,
  (d.from_is_home or d.to_is_home or coalesce(d.stops @> '[{"isHome": true}]'::jsonb, false)) as involves_home
from public.request_items i
join public.mileage_details d on d.item_id = i.id
where i.owner_id = app.current_staff_id()
   or (i.request_id is not null and app.can_view_request(i.request_id));
--> statement-breakpoint
revoke all on public.trip_view from anon, authenticated;
--> statement-breakpoint
grant select on public.trip_view to authenticated;
--> statement-breakpoint

-- =============================================================================================
-- Triggers: locks and totals
-- =============================================================================================

-- Trips in a claim that is not a draft or returned cannot be changed or deleted.
create or replace function app.guard_item_lock() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  st public.request_status;
begin
  if old.request_id is not null then
    select r.status into st from public.requests r where r.id = old.request_id;
    if st is not null and st not in ('draft', 'returned') then
      raise exception 'This trip is in a claim that is %, so it is locked. The claim has to be returned before it can change.', st
        using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end
$$;
--> statement-breakpoint
create trigger request_items_lock before update or delete on public.request_items
  for each row execute function app.guard_item_lock();
--> statement-breakpoint

create or replace function app.guard_mileage_lock() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  st public.request_status;
begin
  select r.status into st
  from public.request_items i
  join public.requests r on r.id = i.request_id
  where i.id = old.item_id;
  if st is not null and st not in ('draft', 'returned') then
    raise exception 'This trip is in a claim that is %, so it is locked. The claim has to be returned before it can change.', st
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end
$$;
--> statement-breakpoint
create trigger mileage_details_lock before update or delete on public.mileage_details
  for each row execute function app.guard_mileage_lock();
--> statement-breakpoint

-- Keep requests.total_cents equal to the sum of its items.
create or replace function app.sync_request_total() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.request_id is not null then
    update public.requests r
       set total_cents = coalesce((select sum(i.amount_cents) from public.request_items i where i.request_id = old.request_id), 0),
           updated_at = now()
     where r.id = old.request_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.request_id is not null then
    update public.requests r
       set total_cents = coalesce((select sum(i.amount_cents) from public.request_items i where i.request_id = new.request_id), 0),
           updated_at = now()
     where r.id = new.request_id;
  end if;
  return null;
end
$$;
--> statement-breakpoint
create trigger request_items_total after insert or update or delete on public.request_items
  for each row execute function app.sync_request_total();
--> statement-breakpoint

-- The audit trail is append-only, even for the table owner's app code.
create or replace function app.guard_events_append_only() returns trigger
language plpgsql
as $$
begin
  raise exception 'The request history cannot be changed.' using errcode = '42501';
end
$$;
--> statement-breakpoint
create trigger request_events_append_only before update or delete on public.request_events
  for each row execute function app.guard_events_append_only();
--> statement-breakpoint

-- =============================================================================================
-- Status transitions. The only way a request or batch changes status.
-- =============================================================================================

create or replace function app.log_event(
  p_request uuid, p_action public.request_action, p_from public.request_status, p_to public.request_status, p_comment text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_staff();
begin
  insert into public.request_events (request_id, actor_id, actor_name, action, from_status, to_status, comment)
  select p_request, s.id, s.full_name, p_action, p_from, p_to, nullif(btrim(p_comment), '')
  from public.staff s where s.id = me;
end
$$;
--> statement-breakpoint

-- Bundle some of my unclaimed items into a new claim and submit it.
create or replace function app.submit_claim(p_items uuid[], p_note text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_staff();
  wanted integer := (select count(distinct x) from unnest(coalesce(p_items, '{}')) x);
  found integer;
  types integer;
  typ text;
  req uuid;
begin
  if wanted = 0 then
    raise exception 'Choose at least one trip to submit.' using errcode = '22023';
  end if;
  select count(*), count(distinct i.request_type), min(i.request_type)
    into found, types, typ
  from public.request_items i
  where i.id = any(p_items) and i.owner_id = me and i.request_id is null;
  if found <> wanted then
    raise exception 'Some of those trips are not yours or are already in a claim.' using errcode = '22023';
  end if;
  if types <> 1 then
    raise exception 'A claim can only hold one kind of request.' using errcode = '22023';
  end if;

  insert into public.requests (request_type, owner_id, status, employee_note, submitted_at)
  values (typ, me, 'submitted', nullif(btrim(p_note), ''), now())
  returning id into req;

  update public.request_items set request_id = req, updated_at = now() where id = any(p_items);
  perform app.log_event(req, 'submitted', null, 'submitted', p_note);
  return req;
end
$$;
--> statement-breakpoint

-- Take back a submitted claim before anyone reviews it (it becomes a draft again).
create or replace function app.withdraw_claim(p_request uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_staff();
  r public.requests;
begin
  select * into r from public.requests where id = p_request for update;
  if r.id is null or r.owner_id <> me then
    raise exception 'Claim not found.' using errcode = '42501';
  end if;
  if r.status <> 'submitted' then
    raise exception 'Only a claim that is waiting for approval can be withdrawn.' using errcode = '22023';
  end if;
  update public.requests set status = 'draft', updated_at = now() where id = p_request;
  perform app.log_event(p_request, 'withdrawn', 'submitted', 'draft', null);
end
$$;
--> statement-breakpoint

-- Send a draft or returned claim (again), with the chosen set of items.
create or replace function app.resubmit_claim(p_request uuid, p_items uuid[], p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_staff();
  r public.requests;
  wanted integer := (select count(distinct x) from unnest(coalesce(p_items, '{}')) x);
  found integer;
begin
  select * into r from public.requests where id = p_request for update;
  if r.id is null or r.owner_id <> me then
    raise exception 'Claim not found.' using errcode = '42501';
  end if;
  if r.status not in ('draft', 'returned') then
    raise exception 'Only a draft or returned claim can be resubmitted.' using errcode = '22023';
  end if;
  if wanted = 0 then
    raise exception 'Choose at least one trip to submit.' using errcode = '22023';
  end if;
  select count(*) into found
  from public.request_items i
  where i.id = any(p_items) and i.owner_id = me and i.request_type = r.request_type
    and (i.request_id is null or i.request_id = p_request);
  if found <> wanted then
    raise exception 'Some of those trips are not yours or are in another claim.' using errcode = '22023';
  end if;

  update public.request_items set request_id = null, updated_at = now()
   where request_id = p_request and not (id = any(p_items));
  update public.request_items set request_id = p_request, updated_at = now()
   where id = any(p_items) and request_id is null;
  update public.requests
     set status = 'submitted', submitted_at = now(), decided_at = null, decided_by = null,
         employee_note = coalesce(nullif(btrim(p_note), ''), employee_note), updated_at = now()
   where id = p_request;
  perform app.log_event(p_request, 'resubmitted', r.status, 'submitted', p_note);
end
$$;
--> statement-breakpoint

-- Coordinator (or admin) decision on a submitted claim: 'approve', 'return' or 'deny'.
-- An approved claim that is not yet in a batch can still be returned, by its reviewer or finance.
create or replace function app.decide_claim(p_request uuid, p_decision text, p_comment text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_staff();
  r public.requests;
  next_status public.request_status;
  act public.request_action;
begin
  select * into r from public.requests where id = p_request for update;
  if r.id is null then
    raise exception 'Claim not found.' using errcode = '42501';
  end if;

  if p_decision = 'approve' then
    next_status := 'approved'; act := 'approved';
  elsif p_decision = 'return' then
    next_status := 'returned'; act := 'returned';
  elsif p_decision = 'deny' then
    next_status := 'denied'; act := 'denied';
  else
    raise exception 'Unknown decision "%".', p_decision using errcode = '22023';
  end if;

  if r.status = 'submitted' then
    if not app.can_review(r.owner_id) then
      raise exception 'You are not the approver for this claim.' using errcode = '42501';
    end if;
  elsif r.status = 'approved' and p_decision = 'return' then
    if r.owner_id = me or not (app.can_review(r.owner_id) or app.has_role('finance')) then
      raise exception 'You cannot return this claim.' using errcode = '42501';
    end if;
  else
    raise exception 'A claim that is % cannot be %.', r.status,
      case p_decision when 'approve' then 'approved' when 'return' then 'returned' else 'denied' end
      using errcode = '22023';
  end if;

  if p_decision in ('return', 'deny') and coalesce(btrim(p_comment), '') = '' then
    raise exception 'Please add a comment so the employee knows why.' using errcode = '22023';
  end if;

  update public.requests
     set status = next_status, decided_at = now(), decided_by = me, updated_at = now()
   where id = p_request;
  perform app.log_event(p_request, act, r.status, next_status, p_comment);
end
$$;
--> statement-breakpoint

create or replace function app.require_finance() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := app.require_staff();
begin
  if not (app.has_role('finance') or app.has_role('admin')) then
    raise exception 'Only finance can do that.' using errcode = '42501';
  end if;
  return me;
end
$$;
--> statement-breakpoint

create or replace function app.sync_batch_total(p_batch uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.batches b
     set total_cents = coalesce((select sum(r.total_cents) from public.requests r where r.batch_id = p_batch), 0)
   where b.id = p_batch
$$;
--> statement-breakpoint

-- Put approved claims into an open batch.
create or replace function app.add_to_batch(p_batch uuid, p_requests uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_finance();
  b public.batches;
  wanted integer := (select count(distinct x) from unnest(coalesce(p_requests, '{}')) x);
  found integer;
  rid uuid;
begin
  select * into b from public.batches where id = p_batch for update;
  if b.id is null then
    raise exception 'Batch not found.' using errcode = '22023';
  end if;
  if b.status <> 'open' then
    raise exception 'Batch B-% has already been exported, so claims cannot be added.', b.ref using errcode = '22023';
  end if;
  if wanted = 0 then
    raise exception 'Choose at least one approved claim.' using errcode = '22023';
  end if;
  select count(*) into found from public.requests r where r.id = any(p_requests) and r.status = 'approved';
  if found <> wanted then
    raise exception 'Only approved claims can go into a batch.' using errcode = '22023';
  end if;
  for rid in select distinct x from unnest(p_requests) x loop
    update public.requests set status = 'batched', batch_id = p_batch, updated_at = now() where id = rid;
    perform app.log_event(rid, 'batched', 'approved', 'batched', 'Added to batch B-' || b.ref);
  end loop;
  perform app.sync_batch_total(p_batch);
end
$$;
--> statement-breakpoint

create or replace function app.create_batch(p_start date, p_end date, p_requests uuid[], p_note text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_finance();
  bid uuid;
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'The pay period end date must be on or after its start date.' using errcode = '22023';
  end if;
  insert into public.batches (period_start, period_end, note, created_by)
  values (p_start, p_end, nullif(btrim(p_note), ''), me)
  returning id into bid;
  perform app.add_to_batch(bid, p_requests);
  return bid;
end
$$;
--> statement-breakpoint

create or replace function app.remove_from_batch(p_request uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_finance();
  r public.requests;
  b public.batches;
begin
  select * into r from public.requests where id = p_request for update;
  if r.id is null or r.status <> 'batched' then
    raise exception 'That claim is not in a batch.' using errcode = '22023';
  end if;
  select * into b from public.batches where id = r.batch_id for update;
  if b.status <> 'open' then
    raise exception 'Batch B-% has already been exported, so claims cannot be removed.', b.ref using errcode = '22023';
  end if;
  update public.requests set status = 'approved', batch_id = null, updated_at = now() where id = p_request;
  perform app.log_event(p_request, 'unbatched', 'batched', 'approved', 'Removed from batch B-' || b.ref);
  perform app.sync_batch_total(b.id);
end
$$;
--> statement-breakpoint

-- Record that the batch file was downloaded for the financial system. Freezes the batch contents.
create or replace function app.mark_batch_exported(p_batch uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_finance();
  b public.batches;
begin
  select * into b from public.batches where id = p_batch for update;
  if b.id is null then
    raise exception 'Batch not found.' using errcode = '22023';
  end if;
  if b.status = 'paid' then
    return;
  end if;
  update public.batches
     set status = 'exported', exported_at = now(), exported_by = me
   where id = p_batch;
end
$$;
--> statement-breakpoint

create or replace function app.mark_batch_paid(p_batch uuid, p_paid_on date) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := app.require_finance();
  b public.batches;
  rid uuid;
begin
  select * into b from public.batches where id = p_batch for update;
  if b.id is null then
    raise exception 'Batch not found.' using errcode = '22023';
  end if;
  if b.status = 'paid' then
    raise exception 'Batch B-% is already marked paid.', b.ref using errcode = '22023';
  end if;
  if p_paid_on is null then
    raise exception 'Enter the date the batch was paid.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.requests r where r.batch_id = p_batch) then
    raise exception 'Batch B-% has no claims in it.', b.ref using errcode = '22023';
  end if;
  update public.batches set status = 'paid', paid_on = p_paid_on, paid_by = me where id = p_batch;
  for rid in select r.id from public.requests r where r.batch_id = p_batch and r.status = 'batched' loop
    update public.requests set status = 'paid', updated_at = now() where id = rid;
    perform app.log_event(rid, 'paid', 'batched', 'paid', 'Paid in batch B-' || b.ref || ' on ' || to_char(p_paid_on, 'Mon FMDD, YYYY'));
  end loop;
end
$$;
--> statement-breakpoint

-- Functions are executable by PUBLIC by default. Lock them down, then open the entry points.
revoke all on all functions in schema app from public;
--> statement-breakpoint
grant execute on function
  app.current_staff_id(), app.has_role(public.app_role), app.is_coordinator_for(uuid), app.can_review(uuid),
  app.can_view_request(uuid), app.request_editable(uuid), app.setting(text), app.require_staff(), app.require_finance(),
  app.submit_claim(uuid[], text), app.withdraw_claim(uuid), app.resubmit_claim(uuid, uuid[], text),
  app.decide_claim(uuid, text, text), app.create_batch(date, date, uuid[], text), app.add_to_batch(uuid, uuid[]),
  app.remove_from_batch(uuid), app.mark_batch_exported(uuid), app.mark_batch_paid(uuid, date)
  to authenticated;
