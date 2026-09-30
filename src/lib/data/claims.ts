import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { batches, requestEvents, requests, staff, tripView } from "@/db/schema";
import { rows, uuidArray, withUser } from "@/db/with-user";
import { hasRole, type Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import type { RequestAction, RequestStatus } from "@/lib/requests/status";
import { asRequestType, type RequestType } from "@/lib/requests/types";
import { phoneMonthsForRequests, type PhoneMonthRecord } from "./phone";
import { selectTrips, tripsForRequests, type TripRecord } from "./trips";

const isUuid = (id: string) => z.string().uuid().safeParse(id).success;

export type ClaimListItem = {
  id: string;
  ref: number;
  type: RequestType;
  status: RequestStatus;
  totalCents: number;
  submittedAt: Date | null;
  updatedAt: Date;
  tripCount: number;
  firstDate: string | null;
  lastDate: string | null;
};

export async function myClaims(viewer: Viewer): Promise<ClaimListItem[]> {
  return withUser(viewer.userId, async (tx) => {
    const list = await rows<{
      id: string;
      ref: number;
      request_type: string;
      status: RequestStatus;
      total_cents: number;
      submitted_at: string | null;
      updated_at: string;
      trip_count: number;
      first_date: string | null;
      last_date: string | null;
    }>(
      tx,
      sql`select r.id, r.ref::int as ref, r.request_type, r.status, r.total_cents, r.submitted_at, r.updated_at,
                 count(i.id)::int as trip_count, min(i.item_date)::text as first_date, max(i.item_date)::text as last_date
          from public.requests r
          left join public.request_items i on i.request_id = r.id
          where r.owner_id = ${viewer.staffId}::uuid
          group by r.id
          order by coalesce(r.submitted_at, r.created_at) desc`,
    );
    return list.map((r) => ({
      id: r.id,
      ref: r.ref,
      type: asRequestType(r.request_type),
      status: r.status,
      totalCents: r.total_cents,
      submittedAt: r.submitted_at ? new Date(r.submitted_at) : null,
      updatedAt: new Date(r.updated_at),
      tripCount: r.trip_count,
      firstDate: r.first_date,
      lastDate: r.last_date,
    }));
  });
}

export type ClaimEvent = {
  id: number;
  action: RequestAction;
  actorName: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  comment: string | null;
  createdAt: Date;
};

export type ClaimDetail = {
  id: string;
  ref: number;
  type: RequestType;
  status: RequestStatus;
  totalCents: number;
  employeeNote: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  owner: { id: string; fullName: string; coordinatorName: string | null };
  batch: { id: string; ref: number; status: string; paidOn: string | null; periodStart: string; periodEnd: string } | null;
  /** Mileage claims: the trips. */
  trips: TripRecord[];
  /** Phone bill claims: the months. */
  phoneMonths: PhoneMonthRecord[];
  events: ClaimEvent[];
  /** Latest comment from whoever returned or denied it. */
  lastDecision: ClaimEvent | null;
  /** What the viewer may do. */
  can: {
    editTrips: boolean;
    withdraw: boolean;
    resubmit: boolean;
    review: boolean;
    returnApproved: boolean;
  };
  isOwner: boolean;
};

export async function claimDetail(viewer: Viewer, id: string): Promise<ClaimDetail | null> {
  if (!isUuid(id)) return null;
  return withUser(viewer.userId, async (tx) => {
    // RLS decides whether the viewer can see this claim at all.
    const [claim] = await tx.select().from(requests).where(eq(requests.id, id)).limit(1);
    if (!claim) return null;
    const coordinator = alias(staff, "coordinator");
    const [owner] = await tx
      .select({ id: staff.id, fullName: staff.fullName, coordinatorName: coordinator.fullName })
      .from(staff)
      .leftJoin(coordinator, eq(coordinator.id, staff.coordinatorId))
      .where(eq(staff.id, claim.ownerId));
    const [batch] = claim.batchId
      ? await tx
          .select({ id: batches.id, ref: batches.ref, status: batches.status, paidOn: batches.paidOn, periodStart: batches.periodStart, periodEnd: batches.periodEnd })
          .from(batches)
          .where(eq(batches.id, claim.batchId))
      : [];
    const trips = await tripsForRequests(tx, [claim.id]);
    const phoneMonths = await phoneMonthsForRequests(tx, [claim.id]);
    const events = (
      await tx.select().from(requestEvents).where(eq(requestEvents.requestId, claim.id)).orderBy(asc(requestEvents.createdAt), asc(requestEvents.id))
    ).map((e) => ({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      comment: e.comment,
      createdAt: e.createdAt,
    }));
    const [{ can_review }] = await rows<{ can_review: boolean }>(tx, sql`select app.can_review(${claim.ownerId}::uuid) as can_review`);

    const isOwner = claim.ownerId === viewer.staffId;
    const editable = claim.status === "draft" || claim.status === "returned";
    return {
      id: claim.id,
      ref: claim.ref,
      type: asRequestType(claim.requestType),
      status: claim.status,
      totalCents: claim.totalCents,
      employeeNote: claim.employeeNote,
      submittedAt: claim.submittedAt,
      decidedAt: claim.decidedAt,
      owner: { id: owner.id, fullName: owner.fullName, coordinatorName: owner.coordinatorName },
      batch: batch ?? null,
      trips,
      phoneMonths,
      events,
      lastDecision: [...events].reverse().find((e) => e.action === "returned" || e.action === "denied") ?? null,
      can: {
        editTrips: isOwner && editable,
        withdraw: isOwner && claim.status === "submitted",
        resubmit: isOwner && editable,
        review: claim.status === "submitted" && can_review,
        returnApproved: claim.status === "approved" && !isOwner && (can_review || hasRole(viewer, "finance")),
      },
      isOwner,
    };
  });
}

/** The viewer's trips that aren't in any claim yet. */
export async function unclaimedTrips(viewer: Viewer) {
  return withUser(viewer.userId, (tx) =>
    selectTrips(tx)
      .where(and(eq(tripView.ownerId, viewer.staffId), isNull(tripView.requestId)))
      .orderBy(asc(tripView.itemDate), asc(tripView.createdAt)),
  );
}

// ---------------------------------------------------------------------------------------------
// Actions (each is one app.* database function: checked, audited, all-or-nothing)
// ---------------------------------------------------------------------------------------------

function checkIds(ids: string[]) {
  const clean = [...new Set(ids)].filter(isUuid);
  if (clean.length === 0) throw new UserError("Choose at least one trip.");
  return clean;
}

export async function submitClaim(viewer: Viewer, itemIds: string[], note: string) {
  const ids = checkIds(itemIds);
  return withUser(viewer.userId, async (tx) => {
    const [{ id }] = await rows<{ id: string }>(tx, sql`select app.submit_claim(${uuidArray(ids)}, ${note}) as id`);
    return id;
  });
}

export async function withdrawClaim(viewer: Viewer, requestId: string) {
  if (!isUuid(requestId)) throw new UserError("Claim not found.");
  await withUser(viewer.userId, (tx) => tx.execute(sql`select app.withdraw_claim(${requestId}::uuid)`));
}

export async function resubmitClaim(viewer: Viewer, requestId: string, itemIds: string[], note: string) {
  if (!isUuid(requestId)) throw new UserError("Claim not found.");
  const ids = checkIds(itemIds);
  await withUser(viewer.userId, (tx) => tx.execute(sql`select app.resubmit_claim(${requestId}::uuid, ${uuidArray(ids)}, ${note})`));
}

export type Decision = "approve" | "return" | "deny";

export async function decideClaim(viewer: Viewer, requestId: string, decision: Decision, comment: string) {
  if (!isUuid(requestId)) throw new UserError("Claim not found.");
  await withUser(viewer.userId, (tx) => tx.execute(sql`select app.decide_claim(${requestId}::uuid, ${decision}, ${comment})`));
}

/** Approves several claims in one go. All or nothing: if any can't be approved, none are. */
export async function approveClaims(viewer: Viewer, requestIds: string[]) {
  const ids = [...new Set(requestIds)].filter(isUuid);
  if (ids.length === 0) throw new UserError("Choose at least one claim.");
  await withUser(viewer.userId, async (tx) => {
    for (const id of ids) await tx.execute(sql`select app.decide_claim(${id}::uuid, 'approve', null)`);
  });
  return ids.length;
}

// ---------------------------------------------------------------------------------------------
// Printable summary
// ---------------------------------------------------------------------------------------------

export async function claimsForPrint(viewer: Viewer, ids: string[]) {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  return withUser(viewer.userId, async (tx) => {
    const list = await tx
      .select({
        id: requests.id,
        ref: requests.ref,
        requestType: requests.requestType,
        status: requests.status,
        totalCents: requests.totalCents,
        ownerName: staff.fullName,
        submittedAt: requests.submittedAt,
      })
      .from(requests)
      .innerJoin(staff, eq(staff.id, requests.ownerId))
      .where(inArray(requests.id, valid))
      .orderBy(asc(staff.fullName), asc(requests.ref));
    const trips = await tripsForRequests(tx, list.map((c) => c.id));
    const phoneMonths = await phoneMonthsForRequests(tx, list.map((c) => c.id));
    const events = await tx.select().from(requestEvents).where(inArray(requestEvents.requestId, list.map((c) => c.id))).orderBy(desc(requestEvents.createdAt));
    return list.map((c) => ({
      ...c,
      type: asRequestType(c.requestType),
      trips: trips.filter((t) => t.requestId === c.id),
      phoneMonths: phoneMonths.filter((m) => m.requestId === c.id),
      approval: events.find((e) => e.requestId === c.id && e.action === "approved") ?? null,
      events: events.filter((e) => e.requestId === c.id).reverse(),
    }));
  });
}
