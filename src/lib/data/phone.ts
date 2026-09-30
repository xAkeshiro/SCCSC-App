/**
 * The phone bill request type: which months someone can claim, claiming them, and fixing a
 * returned claim. Runs as the signed-in user (RLS applies); the database also re-checks locks and
 * that a month is claimed only once. The period rules are in @/lib/requests/phone.
 */
import "server-only";

import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { phoneDetails, programs, rates, requestItems, requests } from "@/db/schema";
import { rows, uuidArray, withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import { todayIso } from "@/lib/format";
import {
  claimablePeriods,
  formatMonth,
  latestOpenPeriod,
  nextPeriod,
  phoneAmountCents,
  type Month,
  type Period,
} from "@/lib/requests/phone";
import type { RequestStatus } from "@/lib/requests/status";
import { readSettings } from "@/lib/settings";

export const REQUEST_TYPE = "phone";

const isUuid = (id: string) => z.string().uuid().safeParse(id).success;
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(m);

/** One month of a phone bill claim. */
export type PhoneMonthRecord = {
  id: string;
  requestId: string | null;
  ownerId: string;
  month: Month;
  programId: string | null;
  programCode: string | null;
  programName: string | null;
  amountCents: number;
  rateCents: string;
};

export async function phoneMonthsForRequests(tx: Tx, requestIds: string[]): Promise<PhoneMonthRecord[]> {
  if (requestIds.length === 0) return [];
  return tx
    .select({
      id: requestItems.id,
      requestId: requestItems.requestId,
      ownerId: requestItems.ownerId,
      month: phoneDetails.month,
      programId: requestItems.programId,
      programCode: programs.code,
      programName: programs.name,
      amountCents: requestItems.amountCents,
      rateCents: phoneDetails.rateCents,
    })
    .from(requestItems)
    .innerJoin(phoneDetails, eq(phoneDetails.itemId, requestItems.id))
    .leftJoin(programs, eq(programs.id, requestItems.programId))
    .where(inArray(requestItems.requestId, requestIds))
    .orderBy(asc(phoneDetails.month));
}

/** The phone rate (cents per month) in force for `month`. */
export async function phoneRateFor(tx: Tx, month: Month) {
  const [rate] = await tx
    .select()
    .from(rates)
    .where(and(eq(rates.requestType, REQUEST_TYPE), lte(rates.effectiveFrom, month)))
    .orderBy(desc(rates.effectiveFrom))
    .limit(1);
  return rate ?? null;
}

export type ClaimedMonth = { month: Month; requestId: string; ref: number; status: RequestStatus };

async function claimedMonths(tx: Tx, staffId: string): Promise<ClaimedMonth[]> {
  const list = await rows<{ month: string; request_id: string; ref: number; status: RequestStatus }>(
    tx,
    sql`select d.month::text as month, r.id as request_id, r.ref::int as ref, r.status
        from public.phone_details d
        join public.request_items i on i.id = d.item_id
        join public.requests r on r.id = i.request_id
        where d.owner_id = ${staffId}::uuid
        order by d.month desc`,
  );
  return list.map((c) => ({ month: c.month, requestId: c.request_id, ref: c.ref, status: c.status }));
}

export type PhoneOverview = {
  /** Cents per month in force now, or null if no phone rate is set up. */
  rateCents: string | null;
  monthsPerClaim: number;
  /** Periods that can be claimed now, newest first, with each month's amount and claim (if any). */
  periods: { period: Period; months: { month: Month; amountCents: number | null; claim: ClaimedMonth | null }[] }[];
  /** The newest period: what the page offers first. */
  latest: Period;
  /** The next period to open. */
  next: Period;
  claimed: ClaimedMonth[];
  programs: { id: string; code: string; name: string }[];
  defaultProgramId: string | null;
  requireProgram: boolean;
};

export async function phoneOverview(viewer: Viewer, today = todayIso()): Promise<PhoneOverview> {
  return withUser(viewer.userId, (tx) => phoneOverviewFor(tx, viewer.staffId, viewer.defaultProgramId, today));
}

export async function phoneOverviewFor(tx: Tx, staffId: string, defaultProgramId: string | null, today: string): Promise<PhoneOverview> {
  const settings = await readSettings(tx);
  const periods = claimablePeriods(today, settings.phoneMonthsPerClaim, settings.phonePeriodsBack);
  const claimed = await claimedMonths(tx, staffId);
  const rateNow = await phoneRateFor(tx, `${today.slice(0, 7)}-01`);
  const withMonths = [];
  for (const period of periods) {
    const months = [];
    for (const month of period.months) {
      const rate = await phoneRateFor(tx, month);
      months.push({
        month,
        amountCents: rate ? phoneAmountCents(rate.rateCents) : null,
        claim: claimed.find((c) => c.month === month) ?? null,
      });
    }
    withMonths.push({ period, months });
  }
  const programList = await tx
    .select({ id: programs.id, code: programs.code, name: programs.name })
    .from(programs)
    .where(eq(programs.active, true))
    .orderBy(asc(programs.code));
  return {
    rateCents: rateNow?.rateCents ?? null,
    monthsPerClaim: settings.phoneMonthsPerClaim,
    periods: withMonths,
    latest: latestOpenPeriod(today, settings.phoneMonthsPerClaim),
    next: nextPeriod(today, settings.phoneMonthsPerClaim),
    claimed,
    programs: programList,
    defaultProgramId,
    requireProgram: settings.requireProgram,
  };
}

/** Months of the latest open period that the viewer hasn't claimed yet (for the home page). */
export async function phoneBillDue(viewer: Viewer, today = todayIso()) {
  const o = await phoneOverview(viewer, today);
  const latest = o.periods[0];
  const unclaimed = latest.months.filter((m) => !m.claim && m.amountCents !== null);
  return {
    period: latest.period,
    unclaimed: unclaimed.map((m) => m.month),
    cents: unclaimed.reduce((n, m) => n + (m.amountCents ?? 0), 0),
    next: o.next,
    available: o.rateCents !== null,
  };
}

export type PhoneClaimInput = { months: string[]; programId: string | null; note: string };

/** Claims the chosen months as one phone bill claim, sent for approval. Returns the claim id. */
export async function claimPhoneBill(viewer: Viewer, input: PhoneClaimInput, today = todayIso()): Promise<string> {
  return withUser(viewer.userId, (tx) => claimPhoneMonths(tx, viewer.staffId, input, today));
}

/** As claimPhoneBill, inside a transaction running as the signed-in staff member `staffId`. */
export async function claimPhoneMonths(tx: Tx, staffId: string, input: PhoneClaimInput, today: string): Promise<string> {
  const months = [...new Set(input.months)].filter(isMonth).sort();
  if (months.length === 0) throw new UserError("Choose at least one month.");
  const settings = await readSettings(tx);
  const open = new Set(claimablePeriods(today, settings.phoneMonthsPerClaim, settings.phonePeriodsBack).flatMap((p) => p.months));
  const closed = months.find((m) => !open.has(m));
  if (closed) throw new UserError(`${formatMonth(closed)} can't be claimed right now.`);
  const already = (await claimedMonths(tx, staffId)).find((c) => months.includes(c.month));
  if (already) throw new UserError(`You've already claimed ${formatMonth(already.month)}.`);

  let programId: string | null = null;
  if (input.programId && isUuid(input.programId)) {
    const [program] = await tx.select().from(programs).where(and(eq(programs.id, input.programId), eq(programs.active, true))).limit(1);
    if (!program) throw new UserError("Choose a program from the list.");
    programId = program.id;
  }
  if (!programId && settings.requireProgram) throw new UserError("Choose the program or grant this is charged to.");

  const ids: string[] = [];
  for (const month of months) {
    const rate = await phoneRateFor(tx, month);
    if (!rate) throw new UserError("The phone bill amount isn't set up yet. Please ask an admin.");
    const [item] = await tx
      .insert(requestItems)
      .values({
        requestType: REQUEST_TYPE,
        ownerId: staffId,
        itemDate: month,
        purpose: `Phone bill, ${formatMonth(month)}`,
        programId,
        amountCents: phoneAmountCents(rate.rateCents),
      })
      .returning({ id: requestItems.id });
    await tx.insert(phoneDetails).values({ itemId: item.id, ownerId: staffId, month, rateId: rate.id, rateCents: rate.rateCents });
    ids.push(item.id);
  }
  const [{ id }] = await rows<{ id: string }>(tx, sql`select app.submit_claim(${uuidArray(ids)}, ${input.note}) as id`);
  return id;
}

/**
 * Sends a draft or returned phone bill claim again, keeping the chosen months. Months left out are
 * removed (so they can be claimed later), since a month can't sit outside a claim.
 */
export async function resubmitPhoneClaim(viewer: Viewer, requestId: string, keepIds: string[], note: string) {
  await withUser(viewer.userId, (tx) => resubmitPhoneMonths(tx, viewer.staffId, requestId, keepIds, note));
}

/** As resubmitPhoneClaim, inside a transaction running as the signed-in staff member `staffId`. */
export async function resubmitPhoneMonths(tx: Tx, staffId: string, requestId: string, keepIds: string[], note: string) {
  if (!isUuid(requestId)) throw new UserError("Claim not found.");
  const [claim] = await tx.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!claim || claim.ownerId !== staffId || claim.requestType !== REQUEST_TYPE) throw new UserError("Claim not found.");
  if (claim.status !== "draft" && claim.status !== "returned") throw new UserError("Only a draft or returned claim can be resubmitted.");
  const items = await tx.select({ id: requestItems.id }).from(requestItems).where(eq(requestItems.requestId, requestId));
  const keep = items.map((i) => i.id).filter((id) => keepIds.includes(id));
  if (keep.length === 0) throw new UserError("Keep at least one month.");
  const remove = items.map((i) => i.id).filter((id) => !keep.includes(id));
  if (remove.length) await tx.delete(requestItems).where(inArray(requestItems.id, remove));
  await tx.execute(sql`select app.resubmit_claim(${requestId}::uuid, ${uuidArray(keep)}, ${note})`);
}
