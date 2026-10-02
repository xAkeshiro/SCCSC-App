-- Budget codes: funds and schools/sites are readable by all active staff (the trip form groups
-- schools by district); accounts by finance and admins. Admins manage all three.
grant select, insert, update, delete on public.funds, public.accounts to authenticated;
--> statement-breakpoint
alter table public.funds enable row level security;
--> statement-breakpoint
alter table public.accounts enable row level security;
--> statement-breakpoint
create policy funds_select on public.funds for select to authenticated
  using (app.current_staff_id() is not null);
--> statement-breakpoint
create policy funds_admin_insert on public.funds for insert to authenticated
  with check (app.has_role('admin'));
--> statement-breakpoint
create policy funds_admin_update on public.funds for update to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint
create policy funds_admin_delete on public.funds for delete to authenticated
  using (app.has_role('admin'));
--> statement-breakpoint
create policy accounts_select on public.accounts for select to authenticated
  using (app.has_role('finance') or app.has_role('admin'));
--> statement-breakpoint
create policy accounts_admin_insert on public.accounts for insert to authenticated
  with check (app.has_role('admin'));
--> statement-breakpoint
create policy accounts_admin_update on public.accounts for update to authenticated
  using (app.has_role('admin')) with check (app.has_role('admin'));
--> statement-breakpoint
create policy accounts_admin_delete on public.accounts for delete to authenticated
  using (app.has_role('admin'));
--> statement-breakpoint

-- Owners can set a trip's direct/indirect and parking while it's editable (RLS and triggers decide when).
grant update (cost_type) on public.request_items to authenticated;
--> statement-breakpoint
grant update (parking_cents) on public.mileage_details to authenticated;
--> statement-breakpoint

-- The trip view gets the renamed site column and the new fields. A view's columns can't be
-- renamed in place, so it is dropped and created again (same rules as before).
drop view public.trip_view;
--> statement-breakpoint
create view public.trip_view as
select
  i.id,
  i.owner_id,
  i.request_id,
  i.item_date,
  i.purpose,
  i.site_id,
  i.cost_type,
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
  d.parking_cents,
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
