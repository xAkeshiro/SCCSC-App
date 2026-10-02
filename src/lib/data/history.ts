import "server-only";

import { sql } from "drizzle-orm";
import { asc } from "drizzle-orm";
import { staff } from "@/db/schema";
import { rows, withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import type { RequestAction, RequestStatus } from "@/lib/requests/status";
import { asRequestType } from "@/lib/requests/types";

export type ClaimHistoryFilters = {
  /** Whose claims (staff id). */
  person: string | null;
  action: RequestAction | null;
  from: string | null;
  to: string | null;
  /** Which page of 50, from 0 (newest). */
  page: number;
};

const PAGE = 50;

/**
 * Every recorded step on claims the viewer can see (for an admin, every claim that was ever sent),
 * newest first: who did what, when, and their comment.
 */
export async function claimHistory(viewer: Viewer, f: ClaimHistoryFilters) {
  return withUser(viewer.userId, async (tx) => {
    const list = await rows<{
      id: number;
      created_at: string;
      actor_name: string;
      action: RequestAction;
      from_status: RequestStatus | null;
      to_status: RequestStatus;
      comment: string | null;
      request_id: string;
      ref: number;
      request_type: string;
      owner_name: string;
      total_cents: number;
    }>(
      tx,
      sql`select e.id::int as id, e.created_at, e.actor_name, e.action, e.from_status, e.to_status, e.comment,
                 r.id as request_id, r.ref::int as ref, r.request_type, s.full_name as owner_name, r.total_cents
          from public.request_events e
          join public.requests r on r.id = e.request_id
          join public.staff s on s.id = r.owner_id
          where true
            ${f.person ? sql`and r.owner_id = ${f.person}::uuid` : sql``}
            ${f.action ? sql`and e.action = ${f.action}::public.request_action` : sql``}
            ${f.from ? sql`and e.created_at >= (${f.from}::date)::timestamp at time zone 'America/Los_Angeles'` : sql``}
            ${f.to ? sql`and e.created_at < (${f.to}::date + 1)::timestamp at time zone 'America/Los_Angeles'` : sql``}
          order by e.created_at desc, e.id desc
          limit ${PAGE + 1} offset ${f.page * PAGE}`,
    );
    const people = await tx.select({ id: staff.id, fullName: staff.fullName }).from(staff).orderBy(asc(staff.fullName));
    return {
      events: list.slice(0, PAGE).map((e) => ({
        id: e.id,
        at: new Date(e.created_at),
        actorName: e.actor_name,
        action: e.action,
        fromStatus: e.from_status,
        toStatus: e.to_status,
        comment: e.comment,
        requestId: e.request_id,
        ref: e.ref,
        type: asRequestType(e.request_type),
        ownerName: e.owner_name,
        totalCents: e.total_cents,
      })),
      more: list.length > PAGE,
      people,
    };
  });
}
