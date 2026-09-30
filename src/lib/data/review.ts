import "server-only";

import { sql } from "drizzle-orm";
import { rows, withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import type { RequestAction } from "@/lib/requests/status";
import { asRequestType, type RequestType } from "@/lib/requests/types";
import { readSettings } from "@/lib/settings";

export type QueueClaim = {
  id: string;
  ref: number;
  type: RequestType;
  ownerName: string;
  totalCents: number;
  submittedAt: Date;
  tripCount: number;
  firstDate: string | null;
  lastDate: string | null;
  homeTrips: number;
  changedMiles: number;
  note: string | null;
  /** The viewer is this person's coordinator (otherwise they review it as an admin). */
  mine: boolean;
  /** Small and unflagged: can be approved in bulk. */
  simple: boolean;
};

export async function reviewQueue(viewer: Viewer) {
  return withUser(viewer.userId, async (tx) => {
    const { bulkApproveMaxCents } = await readSettings(tx);
    const list = await rows<{
      id: string;
      ref: number;
      request_type: string;
      owner_name: string;
      total_cents: number;
      submitted_at: string;
      trip_count: number;
      first_date: string | null;
      last_date: string | null;
      home_trips: number;
      changed_miles: number;
      note: string | null;
      mine: boolean;
    }>(
      tx,
      sql`select r.id, r.ref::int as ref, r.request_type, s.full_name as owner_name, r.total_cents, r.submitted_at, r.employee_note as note,
                 app.is_coordinator_for(r.owner_id) as mine,
                 count(i.id)::int as trip_count, min(i.item_date)::text as first_date, max(i.item_date)::text as last_date,
                 (count(*) filter (where t.involves_home))::int as home_trips,
                 (count(*) filter (where t.override_reason is not null))::int as changed_miles
          from public.requests r
          join public.staff s on s.id = r.owner_id
          left join public.request_items i on i.request_id = r.id
          left join public.trip_view t on t.id = i.id
          where r.status = 'submitted' and app.can_review(r.owner_id)
          group by r.id, s.full_name
          order by r.submitted_at asc`,
    );
    const recent = await rows<{
      id: number;
      request_id: string;
      ref: number;
      request_type: string;
      owner_name: string;
      action: RequestAction;
      comment: string | null;
      created_at: string;
      total_cents: number;
    }>(
      tx,
      sql`select e.id::int as id, e.request_id, r.ref::int as ref, r.request_type, s.full_name as owner_name, e.action, e.comment, e.created_at, r.total_cents
          from public.request_events e
          join public.requests r on r.id = e.request_id
          join public.staff s on s.id = r.owner_id
          where e.actor_id = ${viewer.staffId}::uuid and e.action in ('approved', 'returned', 'denied')
          order by e.created_at desc
          limit 8`,
    );
    const claims: QueueClaim[] = list.map((c) => ({
      id: c.id,
      ref: c.ref,
      type: asRequestType(c.request_type),
      ownerName: c.owner_name,
      totalCents: c.total_cents,
      submittedAt: new Date(c.submitted_at),
      tripCount: c.trip_count,
      firstDate: c.first_date,
      lastDate: c.last_date,
      homeTrips: c.home_trips,
      changedMiles: c.changed_miles,
      note: c.note,
      mine: c.mine,
      simple: c.home_trips === 0 && c.changed_miles === 0 && c.total_cents <= bulkApproveMaxCents,
    }));
    return {
      claims,
      bulkApproveMaxCents,
      recent: recent.map((e) => ({
        id: e.id,
        requestId: e.request_id,
        ref: e.ref,
        type: asRequestType(e.request_type),
        ownerName: e.owner_name,
        action: e.action,
        comment: e.comment,
        createdAt: new Date(e.created_at),
        totalCents: e.total_cents,
      })),
    };
  });
}
