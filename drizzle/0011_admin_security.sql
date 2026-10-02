-- Admin history: readable by admins, written only through app.log_admin (which records who did
-- it), and never changed or deleted.
alter table public.admin_events enable row level security;
--> statement-breakpoint
revoke all on public.admin_events from anon, authenticated;
--> statement-breakpoint
grant select on public.admin_events to authenticated;
--> statement-breakpoint
create policy admin_events_select on public.admin_events for select to authenticated
  using (app.has_role('admin'));
--> statement-breakpoint
create or replace function app.guard_admin_events_append_only() returns trigger
language plpgsql
as $$
begin
  raise exception 'The admin history cannot be changed.' using errcode = '42501';
end
$$;
--> statement-breakpoint
create trigger admin_events_append_only before update or delete on public.admin_events
  for each row execute function app.guard_admin_events_append_only();
--> statement-breakpoint
create or replace function app.log_admin(p_area public.admin_area, p_summary text, p_staff uuid default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := app.current_staff_id();
begin
  if v_actor is null or not app.has_role('admin') then
    raise exception 'Only an admin can do that.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_summary), '') = '' then
    raise exception 'Say what changed.' using errcode = '22023';
  end if;
  insert into public.admin_events (actor_id, actor_name, area, summary, staff_id)
  select v_actor, s.full_name, p_area, left(btrim(p_summary), 1000), p_staff
  from public.staff s where s.id = v_actor;
end
$$;
--> statement-breakpoint
revoke all on function app.log_admin(public.admin_area, text, uuid) from public;
--> statement-breakpoint
grant execute on function app.log_admin(public.admin_area, text, uuid) to authenticated;
