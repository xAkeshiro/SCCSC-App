-- Phone bill reimbursement: request types as reference data, and phone_details security.
-- One statement per breakpoint (PGlite and drizzle-kit run them one at a time).

-- Request types are reference data every database needs (the demo seed used to add mileage).
insert into public.request_types (id, name, description, config) values
  ('mileage', 'Mileage', 'Business miles driven in a personal vehicle.', '{"unit": "mile"}'),
  ('phone', 'Phone bill', 'A monthly amount for using a personal phone for work, claimed every few months.', '{"unit": "month"}')
on conflict (id) do nothing;
--> statement-breakpoint

grant select, insert, delete on public.phone_details to authenticated;
--> statement-breakpoint
alter table public.phone_details enable row level security;
--> statement-breakpoint

-- Which month a phone item pays for isn't personal: whoever can see the item can see it.
-- (The subquery runs under request_items' own policies.)
create policy phone_details_select on public.phone_details for select to authenticated
  using (exists (select 1 from public.request_items i where i.id = item_id));
--> statement-breakpoint
create policy phone_details_insert on public.phone_details for insert to authenticated
  with check (
    owner_id = app.current_staff_id()
    and exists (
      select 1 from public.request_items i
      where i.id = item_id and i.owner_id = app.current_staff_id() and i.request_type = 'phone'
        and app.request_editable(i.request_id)
    )
  );
--> statement-breakpoint
create policy phone_details_delete on public.phone_details for delete to authenticated
  using (
    owner_id = app.current_staff_id()
    and exists (
      select 1 from public.request_items i
      where i.id = item_id and i.owner_id = app.current_staff_id() and app.request_editable(i.request_id)
    )
  );
--> statement-breakpoint

-- Months in a claim that is not a draft or returned cannot be changed or removed, even by owner code.
create or replace function app.guard_phone_lock() returns trigger
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
    raise exception 'This month is in a claim that is %, so it is locked. The claim has to be returned before it can change.', st
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end
$$;
--> statement-breakpoint
create trigger phone_details_lock before update or delete on public.phone_details
  for each row execute function app.guard_phone_lock();
