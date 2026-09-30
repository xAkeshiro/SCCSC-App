import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { batches, programs, requestEvents, requests, staff } from "@/db/schema";
import { rows, uuidArray, withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import type { RequestStatus } from "@/lib/requests/status";
import { formatMonth } from "@/lib/requests/phone";
import { asRequestType, type RequestType } from "@/lib/requests/types";
import { phoneMonthsForRequests } from "./phone";
import { tripsForRequests } from "./trips";

const isUuid = (id: string) => z.string().uuid().safeParse(id).success;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

export type BatchStatus = "open" | "exported" | "paid";

export type ApprovedClaim = {
  id: string;
  ref: number;
  type: RequestType;
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
      request_type: string;
      owner_name: string;
      total_cents: number;
      trip_count: number;
      first_date: string | null;
      last_date: string | null;
      approved_by: string | null;
      approved_at: string | null;
    }>(
      tx,
      sql`select r.id, r.ref::int as ref, r.request_type, s.full_name as owner_name, r.total_cents,
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
        type: asRequestType(c.request_type),
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
      .select({
        id: requests.id,
        ref: requests.ref,
        requestType: requests.requestType,
        status: requests.status,
        totalCents: requests.totalCents,
        ownerName: staff.fullName,
      })
      .from(requests)
      .innerJoin(staff, eq(staff.id, requests.ownerId))
      .where(eq(requests.batchId, id))
      .orderBy(asc(staff.fullName), asc(requests.ref));
    const trips = await tripsForRequests(tx, claims.map((c) => c.id));
    const phoneMonths = await phoneMonthsForRequests(tx, claims.map((c) => c.id));
    const approvals = claims.length
      ? await tx
          .select({ requestId: requestEvents.requestId, actorName: requestEvents.actorName, createdAt: requestEvents.createdAt })
          .from(requestEvents)
          .where(and(inArray(requestEvents.requestId, claims.map((c) => c.id)), eq(requestEvents.action, "approved")))
          .orderBy(desc(requestEvents.createdAt))
      : [];

    const byProgram = new Map<string, { code: string; name: string; miles: number; cents: number; trips: number; months: number }>();
    const programRow = (code: string | null, name: string | null) => {
      const key = code ?? "none";
      const row = byProgram.get(key) ?? { code: code ?? "None", name: name ?? "No program", miles: 0, cents: 0, trips: 0, months: 0 };
      byProgram.set(key, row);
      return row;
    };
    for (const t of trips) {
      const row = programRow(t.programCode, t.programName);
      row.miles += Number(t.miles);
      row.cents += t.amountCents;
      row.trips += 1;
    }
    for (const m of phoneMonths) {
      const row = programRow(m.programCode, m.programName);
      row.cents += m.amountCents;
      row.months += 1;
    }

    return {
      ...batch,
      claims: claims.map((c) => {
        const approval = approvals.find((a) => a.requestId === c.id);
        const ts = trips.filter((t) => t.requestId === c.id);
        return {
          ...c,
          type: asRequestType(c.requestType),
          status: c.status as RequestStatus,
          trips: ts,
          phoneMonths: phoneMonths.filter((m) => m.requestId === c.id),
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

export type ReportType = "all" | RequestType;

export type ReportFilters = {
  from: string;
  to: string;
  staffId: string | null;
  programId: string | null;
  statuses: RequestStatus[];
  type: ReportType;
};

export const REPORT_STATUSES: RequestStatus[] = ["submitted", "approved", "batched", "paid"];

export type ReportLine = {
  id: string;
  type: RequestType;
  /** The trip date, or the first day of the month a phone bill pays for. */
  date: string;
  ownerName: string;
  claimRef: number;
  claimStatus: RequestStatus;
  programCode: string | null;
  purpose: string;
  /** The route for a trip; the month ("July 2026") for a phone bill. */
  detail: string;
  miles: number | null;
  amountCents: number;
};

/**
 * Trips and phone bill months in claims finance can see, filtered by date (a trip's date, or the
 * first day of a phone bill's month), type, employee, program and claim status.
 */
export async function reimbursementReport(viewer: Viewer, f: ReportFilters) {
  return withUser(viewer.userId, async (tx) => {
    const people = await tx.select({ id: staff.id, fullName: staff.fullName }).from(staff).orderBy(asc(staff.fullName));
    const programList = await tx.select({ id: programs.id, code: programs.code, name: programs.name }).from(programs).orderBy(asc(programs.code));
    const statuses = f.statuses.filter((s) => REPORT_STATUSES.includes(s));
    const statusList = `{${(statuses.length ? statuses : REPORT_STATUSES).join(",")}}`;
    const byStaff = f.staffId && isUuid(f.staffId) ? sql`and i.owner_id = ${f.staffId}::uuid` : sql``;
    const byProgram = f.programId && isUuid(f.programId) ? sql`and i.program_id = ${f.programId}::uuid` : sql``;

    const tripRows =
      f.type === "phone"
        ? []
        : await rows<{
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
            sql`select i.id, i.item_date::text, s.full_name as owner_name, r.ref::int as claim_ref, r.status as claim_status,
                       p.code as program_code, i.purpose, i.from_label, i.to_label, i.round_trip, i.miles::text, i.amount_cents
                from public.trip_view i
                join public.requests r on r.id = i.request_id
                join public.staff s on s.id = i.owner_id
                left join public.programs p on p.id = i.program_id
                where i.item_date between ${f.from}::date and ${f.to}::date
                  and r.status::text = any(${statusList}::text[])
                  ${byStaff} ${byProgram}`,
          );
    const phoneRows =
      f.type === "mileage"
        ? []
        : await rows<{
            id: string;
            month: string;
            owner_name: string;
            claim_ref: number;
            claim_status: RequestStatus;
            program_code: string | null;
            purpose: string;
            amount_cents: number;
          }>(
            tx,
            sql`select i.id, d.month::text as month, s.full_name as owner_name, r.ref::int as claim_ref, r.status as claim_status,
                       p.code as program_code, i.purpose, i.amount_cents
                from public.request_items i
                join public.phone_details d on d.item_id = i.id
                join public.requests r on r.id = i.request_id
                join public.staff s on s.id = i.owner_id
                left join public.programs p on p.id = i.program_id
                where d.month between ${f.from}::date and ${f.to}::date
                  and r.status::text = any(${statusList}::text[])
                  ${byStaff} ${byProgram}`,
          );

    const lines: ReportLine[] = [
      ...tripRows.map((r) => ({
        id: r.id,
        type: "mileage" as const,
        date: r.item_date,
        ownerName: r.owner_name,
        claimRef: r.claim_ref,
        claimStatus: r.claim_status,
        programCode: r.program_code,
        purpose: r.purpose,
        detail: `${r.from_label} → ${r.to_label}${r.round_trip ? " and back" : ""}`,
        miles: Number(r.miles),
        amountCents: r.amount_cents,
      })),
      ...phoneRows.map((r) => ({
        id: r.id,
        type: "phone" as const,
        date: r.month,
        ownerName: r.owner_name,
        claimRef: r.claim_ref,
        claimStatus: r.claim_status,
        programCode: r.program_code,
        purpose: r.purpose,
        detail: formatMonth(r.month),
        miles: null,
        amountCents: r.amount_cents,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.ownerName.localeCompare(b.ownerName) || a.type.localeCompare(b.type));

    const group = (key: (l: ReportLine) => string) => {
      const map = new Map<string, { label: string; trips: number; months: number; miles: number; cents: number }>();
      for (const l of lines) {
        const k = key(l);
        const row = map.get(k) ?? { label: k, trips: 0, months: 0, miles: 0, cents: 0 };
        if (l.type === "phone") row.months += 1;
        else row.trips += 1;
        row.miles += l.miles ?? 0;
        row.cents += l.amountCents;
        map.set(k, row);
      }
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    };
    return {
      people,
      programs: programList,
      lines,
      byEmployee: group((l) => l.ownerName),
      byProgram: group((l) => l.programCode ?? "None"),
      totals: {
        trips: lines.filter((l) => l.type === "mileage").length,
        months: lines.filter((l) => l.type === "phone").length,
        miles: lines.reduce((n, l) => n + (l.miles ?? 0), 0),
        cents: lines.reduce((n, l) => n + l.amountCents, 0),
      },
    };
  });
}
