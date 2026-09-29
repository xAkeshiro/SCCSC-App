import "server-only";

import { sql } from "drizzle-orm";
import { rows, withUser } from "@/db/with-user";
import { hasRole, type Viewer } from "@/lib/auth/viewer";
import type { RequestAction, RequestStatus } from "@/lib/requests/status";

export type HomeSummary = {
  unclaimed: { count: number; cents: number };
  waiting: { count: number; cents: number };
  approved: { count: number; cents: number };
  paidThisYear: { count: number; cents: number };
  needsAction: { id: string; ref: number; status: RequestStatus; totalCents: number; comment: string | null; by: string | null }[];
  updates: {
    id: number;
    requestId: string;
    ref: number;
    action: RequestAction;
    actorName: string;
    comment: string | null;
    createdAt: Date;
    isNew: boolean;
  }[];
  toReview: number;
  toBatch: number;
  accessRequests: number;
};

export async function homeSummary(viewer: Viewer): Promise<HomeSummary> {
  const me = viewer.staffId;
  return withUser(viewer.userId, async (tx) => {
    const [totals] = await rows<{
      unclaimed_count: number;
      unclaimed_cents: number;
      waiting_count: number;
      waiting_cents: number;
      approved_count: number;
      approved_cents: number;
      paid_count: number;
      paid_cents: number;
    }>(
      tx,
      sql`select
        (select count(*)::int from public.request_items where owner_id = ${me}::uuid and request_id is null) as unclaimed_count,
        (select coalesce(sum(amount_cents), 0)::int from public.request_items where owner_id = ${me}::uuid and request_id is null) as unclaimed_cents,
        count(*) filter (where r.status = 'submitted')::int as waiting_count,
        coalesce(sum(r.total_cents) filter (where r.status = 'submitted'), 0)::int as waiting_cents,
        count(*) filter (where r.status in ('approved', 'batched'))::int as approved_count,
        coalesce(sum(r.total_cents) filter (where r.status in ('approved', 'batched')), 0)::int as approved_cents,
        count(*) filter (where r.status = 'paid' and extract(year from b.paid_on) = extract(year from current_date))::int as paid_count,
        coalesce(sum(r.total_cents) filter (where r.status = 'paid' and extract(year from b.paid_on) = extract(year from current_date)), 0)::int as paid_cents
      from public.requests r
      left join public.batches b on b.id = r.batch_id
      where r.owner_id = ${me}::uuid`,
    );

    const needsAction = await rows<{ id: string; ref: number; status: RequestStatus; total_cents: number; comment: string | null; by: string | null }>(
      tx,
      sql`select r.id, r.ref::int as ref, r.status, r.total_cents, e.comment, e.actor_name as by
          from public.requests r
          left join lateral (
            select comment, actor_name from public.request_events
            where request_id = r.id and action = 'returned' order by created_at desc limit 1
          ) e on true
          where r.owner_id = ${me}::uuid and r.status in ('returned', 'draft')
          order by r.updated_at desc`,
    );

    const updates = await rows<{
      id: number;
      request_id: string;
      ref: number;
      action: RequestAction;
      actor_name: string;
      comment: string | null;
      created_at: string;
      is_new: boolean;
    }>(
      tx,
      sql`select e.id::int as id, e.request_id, r.ref::int as ref, e.action, e.actor_name, e.comment, e.created_at,
                 e.created_at > coalesce((select updates_seen_at from public.staff_state where staff_id = ${me}::uuid), 'epoch') as is_new
          from public.request_events e
          join public.requests r on r.id = e.request_id
          where r.owner_id = ${me}::uuid and e.actor_id is distinct from ${me}::uuid
            and e.action in ('approved', 'returned', 'denied', 'paid')
          order by e.created_at desc
          limit 6`,
    );

    const [queues] = await rows<{ review: number; batch: number; access: number }>(
      tx,
      sql`select
        ${hasRole(viewer, "coordinator", "admin") ? sql`(select count(*)::int from public.requests r where r.status = 'submitted' and app.can_review(r.owner_id))` : sql`0`} as review,
        ${hasRole(viewer, "finance", "admin") ? sql`(select count(*)::int from public.requests where status = 'approved')` : sql`0`} as batch,
        ${hasRole(viewer, "admin") ? sql`(select count(*)::int from public.access_requests where status = 'pending')` : sql`0`} as access`,
    );

    return {
      unclaimed: { count: totals.unclaimed_count, cents: totals.unclaimed_cents },
      waiting: { count: totals.waiting_count, cents: totals.waiting_cents },
      approved: { count: totals.approved_count, cents: totals.approved_cents },
      paidThisYear: { count: totals.paid_count, cents: totals.paid_cents },
      needsAction: needsAction.map((r) => ({
        id: r.id,
        ref: r.ref,
        status: r.status,
        totalCents: r.total_cents,
        comment: r.comment,
        by: r.by,
      })),
      updates: updates.map((u) => ({
        id: u.id,
        requestId: u.request_id,
        ref: u.ref,
        action: u.action,
        actorName: u.actor_name,
        comment: u.comment,
        createdAt: new Date(u.created_at),
        isNew: u.is_new,
      })),
      toReview: queues.review,
      toBatch: queues.batch,
      accessRequests: queues.access,
    };
  });
}

/** Marks every update up to now as read. */
export async function markUpdatesSeen(viewer: Viewer) {
  await withUser(viewer.userId, (tx) =>
    tx.execute(sql`insert into public.staff_state (staff_id, updates_seen_at) values (${viewer.staffId}::uuid, now())
                   on conflict (staff_id) do update set updates_seen_at = excluded.updates_seen_at`),
  );
}
