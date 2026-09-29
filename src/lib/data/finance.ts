import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { batches, programs, requestEvents, requests, staff } from "@/db/schema";
import { rows, uuidArray, withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import type { RequestStatus } from "@/lib/requests/status";
import { tripsForRequests } from "./trips";

const isUuid = (id: string) => z.string().uuid().safeParse(id).success;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

export type BatchStatus = "open" | "exported" | "paid";

export type ApprovedClaim = {
  id: string;
  ref: number;
  ownerName: string;
  totalCents: number;
  tripCount: number;
  firstDate: string | null;
  lastDate: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
};

export async function financeOverview(viewer: Viewer) {
  return withUser(viewer.userId, async (tx) => {
    const approved = await rows<{
      id: string;
      ref: number;
      owner_name: string;
      total_cents: number;
      trip_count: number;
      first_date: string | null;
      last_date: string | null;
      approved_by: string | null;
      approved_at: string | null;
    }>(
      tx,
      sql`select r.id, r.ref::int as ref, s.full_name as owner_name, r.total_cents,
                 count(i.id)::int as trip_count, min(i.item_date)::text as first_date, max(i.item_date)::text as last_date,
                 a.actor_name as approved_by, a.created_at as approved_at
          from public.requests r
          join public.staff s on s.id = r.owner_id
          left join public.request_items i on i.request_id = r.id
          left join lateral (
            select actor_name, created_at from public.request_events
            where request_id = r.id and action = 'approved' order by created_at desc limit 1
          ) a on true
          where r.status = 'approved'
          group by r.id, s.full_name, a.actor_name, a.created_at
          order by s.full_name, r.ref`,
    );
    const batchList = await rows<{
      id: string;
      ref: number;
      period_start: string;
      period_end: string;
      status: BatchStatus;
      total_cents: number;
      claim_count: number;
      exported_at: string | null;
      paid_on: string | null;
      created_at: string;
    }>(
      tx,
      sql`select b.id, b.ref::int as ref, b.period_start::text, b.period_end::text, b.status, b.total_cents,
                 (select count(*)::int from public.requests r where r.batch_id = b.id) as claim_count,
                 b.exported_at, b.paid_on::text, b.created_at
          from public.batches b
          order by b.created_at desc
          limit 50`,
    );
    return {
      approved: approved.map<ApprovedClaim>((c) => ({
        id: c.id,
        ref: c.ref,
        ownerName: c.owner_name,
        totalCents: c.total_cents,
        tripCount: c.trip_count,
        firstDate: c.first_date,
        lastDate: c.last_date,
        approvedBy: c.approved_by,
        approvedAt: c.approved_at ? new Date(c.approved_at) : null,
      })),
      batches: batchList.map((b) => ({
        id: b.id,
        ref: b.ref,
        periodStart: b.period_start,
        periodEnd: b.period_end,
        status: b.status,
        totalCents: b.total_cents,
        claimCount: b.claim_count,
        exportedAt: b.exported_at ? new Date(b.exported_at) : null,
        paidOn: b.paid_on,
      })),
    };
  });
}

export async function batchDetail(viewer: Viewer, id: string) {
  if (!isUuid(id)) return null;
  return withUser(viewer.userId, async (tx) => {
    const creator = alias(staff, "creator");
    const exporter = alias(staff, "exporter");
    const payer = alias(staff, "payer");
    const [batch] = await tx
      .select({
        id: batches.id,
        ref: batches.ref,
        periodStart: batches.periodStart,
        periodEnd: batches.periodEnd,
        status: batches.status,
        totalCents: batches.totalCents,
        note: batches.note,
        createdAt: batches.createdAt,
        createdBy: creator.fullName,
        exportedAt: batches.exportedAt,
        exportedBy: exporter.fullName,
        paidOn: batches.paidOn,
        paidBy: payer.fullName,
      })
      .from(batches)
      .leftJoin(creator, eq(creator.id, batches.createdBy))
      .leftJoin(exporter, eq(exporter.id, batches.exportedBy))
      .leftJoin(payer, eq(payer.id, batches.paidBy))
      .where(eq(batches.id, id))
      .limit(1);
    if (!batch) return null;
    const claims = await tx
      .select({ id: requests.id, ref: requests.ref, status: requests.status, totalCents: requests.totalCents, ownerName: staff.fullName })
      .from(requests)
      .innerJoin(staff, eq(staff.id, requests.ownerId))
      .where(eq(requests.batchId, id))
      .orderBy(asc(staff.fullName), asc(requests.ref));
    const trips = await tripsForRequests(tx, claims.map((c) => c.id));
    const approvals = claims.length
      ? await tx
          .select({ requestId: requestEvents.requestId, actorName: requestEvents.actorName, createdAt: requestEvents.createdAt })
          .from(requestEvents)
          .where(and(inArray(requestEvents.requestId, claims.map((c) => c.id)), eq(requestEvents.action, "approved")))
          .orderBy(desc(requestEvents.createdAt))
      : [];

    const byProgram = new Map<string, { code: string; name: string; miles: number; cents: number; trips: number }>();
    for (const t of trips) {
      const key = t.programCode ?? "none";
      const row = byProgram.get(key) ?? { code: t.programCode ?? "None", name: t.programName ?? "No program", miles: 0, cents: 0, trips: 0 };
      row.miles += Number(t.miles);
      row.cents += t.amountCents;
      row.trips += 1;
      byProgram.set(key, row);
    }

    return {
      ...batch,
      claims: claims.map((c) => {
        const approval = approvals.find((a) => a.requestId === c.id);
        const ts = trips.filter((t) => t.requestId === c.id);
        return {
          ...c,
          status: c.status as RequestStatus,
          trips: ts,
          miles: ts.reduce((n, t) => n + Number(t.miles), 0),
          approvedBy: approval?.actorName ?? null,
          approvedAt: approval?.createdAt ?? null,
        };
      }),
      byProgram: [...byProgram.values()].sort((a, b) => a.code.localeCompare(b.code)),
    };
  });
}

export type BatchDetail = NonNullable<Awaited<ReturnType<typeof batchDetail>>>;

// ---------------------------------------------------------------------------------------------
// Actions (app.* database functions: finance or admin only, audited on each claim)
// ---------------------------------------------------------------------------------------------

export async function createBatch(viewer: Viewer, input: { start: string; end: string; claimIds: string[]; note: string }) {
  if (!isDate(input.start) || !isDate(input.end)) throw new UserError("Enter the pay period start and end dates.");
  const ids = [...new Set(input.claimIds)].filter(isUuid);
  if (ids.length === 0) throw new UserError("Choose at least one approved claim.");
  return withUser(viewer.userId, async (tx) => {
    const [{ id }] = await rows<{ id: string }>(
      tx,
      sql`select app.create_batch(${input.start}::date, ${input.end}::date, ${uuidArray(ids)}, ${input.note}) as id`,
    );
    return id;
  });
}

export async function addToBatch(viewer: Viewer, batchId: string, claimIds: string[]) {
  const ids = [...new Set(claimIds)].filter(isUuid);
  if (!isUuid(batchId)) throw new UserError("Batch not found.");
  if (ids.length === 0) throw new UserError("Choose at least one approved claim.");
  await withUser(viewer.userId, (tx) => tx.execute(sql`select app.add_to_batch(${batchId}::uuid, ${uuidArray(ids)})`));
}

export async function removeFromBatch(viewer: Viewer, claimId: string) {
  if (!isUuid(claimId)) throw new UserError("Claim not found.");
  await withUser(viewer.userId, (tx) => tx.execute(sql`select app.remove_from_batch(${claimId}::uuid)`));
}

export async function markBatchExported(viewer: Viewer, batchId: string) {
  if (!isUuid(batchId)) throw new UserError("Batch not found.");
  await withUser(viewer.userId, (tx) => tx.execute(sql`select app.mark_batch_exported(${batchId}::uuid)`));
}

export async function markBatchPaid(viewer: Viewer, batchId: string, paidOn: string) {
  if (!isUuid(batchId)) throw new UserError("Batch not found.");
  if (!isDate(paidOn)) throw new UserError("Enter the date the batch was paid.");
  await withUser(viewer.userId, (tx) => tx.execute(sql`select app.mark_batch_paid(${batchId}::uuid, ${paidOn}::date)`));
}

// ---------------------------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------------------------

export type ReportFilters = { from: string; to: string; staffId: string | null; programId: string | null; statuses: RequestStatus[] };

export const REPORT_STATUSES: RequestStatus[] = ["submitted", "approved", "batched", "paid"];

/** Trips in claims finance can see, filtered by trip date, employee, program and claim status. */
export async function mileageReport(viewer: Viewer, f: ReportFilters) {
  return withUser(viewer.userId, async (tx) => {
    const people = await tx.select({ id: staff.id, fullName: staff.fullName }).from(staff).orderBy(asc(staff.fullName));
    const programList = await tx.select({ id: programs.id, code: programs.code, name: programs.name }).from(programs).orderBy(asc(programs.code));
    const statuses = f.statuses.filter((s) => REPORT_STATUSES.includes(s));
    const list = await rows<{
      id: string;
      item_date: string;
      owner_name: string;
      claim_ref: number;
      claim_status: RequestStatus;
      program_code: string | null;
      purpose: string;
      from_label: string;
      to_label: string;
      round_trip: boolean;
      miles: string;
      amount_cents: number;
    }>(
      tx,
      sql`select t.id, t.item_date::text, s.full_name as owner_name, r.ref::int as claim_ref, r.status as claim_status,
                 p.code as program_code, t.purpose, t.from_label, t.to_label, t.round_trip, t.miles::text, t.amount_cents
          from public.trip_view t
          join public.requests r on r.id = t.request_id
          join public.staff s on s.id = t.owner_id
          left join public.programs p on p.id = t.program_id
          where t.item_date between ${f.from}::date and ${f.to}::date
            and r.status::text = any(${`{${(statuses.length ? statuses : REPORT_STATUSES).join(",")}}`}::text[])
            ${f.staffId && isUuid(f.staffId) ? sql`and t.owner_id = ${f.staffId}::uuid` : sql``}
            ${f.programId && isUuid(f.programId) ? sql`and t.program_id = ${f.programId}::uuid` : sql``}
          order by t.item_date, s.full_name`,
    );
    const trips = list.map((r) => ({
      id: r.id,
      date: r.item_date,
      ownerName: r.owner_name,
      claimRef: r.claim_ref,
      claimStatus: r.claim_status,
      programCode: r.program_code,
      purpose: r.purpose,
      route: `${r.from_label} → ${r.to_label}${r.round_trip ? " and back" : ""}`,
      miles: Number(r.miles),
      amountCents: r.amount_cents,
    }));
    const group = (key: (t: (typeof trips)[number]) => string) => {
      const map = new Map<string, { label: string; trips: number; miles: number; cents: number }>();
      for (const t of trips) {
        const k = key(t);
        const row = map.get(k) ?? { label: k, trips: 0, miles: 0, cents: 0 };
        row.trips += 1;
        row.miles += t.miles;
        row.cents += t.amountCents;
        map.set(k, row);
      }
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    };
    return {
      people,
      programs: programList,
      trips,
      byEmployee: group((t) => t.ownerName),
      byProgram: group((t) => t.programCode ?? "None"),
      totals: { trips: trips.length, miles: trips.reduce((n, t) => n + t.miles, 0), cents: trips.reduce((n, t) => n + t.amountCents, 0) },
    };
  });
}
