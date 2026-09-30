-- Files sent with a claim (a phone bill photo or PDF): who can see and add them, locks, and the
-- rule that a phone bill claim needs one. One statement per breakpoint.

grant select, insert, delete on public.request_attachments to authenticated;
--> statement-breakpoint
alter table public.request_attachments enable row level security;
--> statement-breakpoint

-- True only inside the transaction that sent (or re-sent) the claim: submit_claim and
-- resubmit_claim stamp submitted_at with now(), the transaction's start time. That lets a new
-- claim's files be saved right after it's created, without leaving submitted claims open to edits.
create or replace function app.submitted_in_this_transaction(p_request uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.requests r where r.id = p_request and r.status = 'submitted' and r.submitted_at = now())
$$;
--> statement-breakpoint

-- A bill can hold personal details, so it has exactly the claim's visibility.
create policy request_attachments_select on public.request_attachments for select to authenticated
  using (app.can_view_request(request_id));
--> statement-breakpoint
create policy request_attachments_insert on public.request_attachments for insert to authenticated
  with check (
    owner_id = app.current_staff_id()
    and exists (select 1 from public.requests r where r.id = request_id and r.owner_id = app.current_staff_id())
    and (app.request_editable(request_id) or app.submitted_in_this_transaction(request_id))
  );
--> statement-breakpoint
create policy request_attachments_delete on public.request_attachments for delete to authenticated
  using (owner_id = app.current_staff_id() and app.request_editable(request_id));
--> statement-breakpoint

-- Files on a claim that is not a draft or returned can't be changed or removed, even by owner code.
create or replace function app.guard_attachment_lock() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  st public.request_status;
begin
  select r.status into st from public.requests r where r.id = old.request_id;
  if st is not null and st not in ('draft', 'returned') then
    raise exception 'This file is on a claim that is %, so it is locked. The claim has to be returned before it can change.', st
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end
$$;
--> statement-breakpoint
create trigger request_attachments_lock before update or delete on public.request_attachments
  for each row execute function app.guard_attachment_lock();
--> statement-breakpoint

-- Request types that need a file (a photo or PDF of the bill) before they can be sent.
update public.request_types set config = config || '{"attachments": "required"}'::jsonb where id = 'phone';
--> statement-breakpoint

-- Checked when the transaction commits, so a claim and its files can be saved in either order.
create or replace function app.check_required_attachments() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.requests r
    join public.request_types t on t.id = r.request_type
    where r.id = new.id
      and r.status = 'submitted'
      and t.config ->> 'attachments' = 'required'
      and not exists (select 1 from public.request_attachments a where a.request_id = r.id)
  ) then
    raise exception 'A phone bill claim needs a photo or PDF of the bill.' using errcode = '23514';
  end if;
  return null;
end
$$;
--> statement-breakpoint
create constraint trigger requests_attachments_required after insert or update of status on public.requests
  deferrable initially deferred
  for each row execute function app.check_required_attachments();
