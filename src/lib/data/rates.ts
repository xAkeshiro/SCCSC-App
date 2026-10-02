import "server-only";

import { and, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { rates, settings, staff } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import { formatDay, todayIso } from "@/lib/format";
import { RATE_TYPES, RULE_KEYS, describeRule, formatRateDollars, type RateType, type Rules } from "@/lib/rules";
import { readSettings } from "@/lib/settings";
import { logAdmin } from "./admin-log";
import { setSetting } from "./budget-codes";

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const longDay = (d: string) => formatDay(d, { withYear: true, weekday: false });

/** Rates by type (newest first, marked current, upcoming or past) and the rules, with who last changed each. */
export async function ratesAndRules(viewer: Viewer) {
  return withUser(viewer.userId, async (tx) => {
    const today = todayIso();
    const rateRows = await tx
      .select({
        id: rates.id,
        requestType: rates.requestType,
        rateCents: rates.rateCents,
        effectiveFrom: rates.effectiveFrom,
        note: rates.note,
        createdAt: rates.createdAt,
        createdBy: staff.fullName,
      })
      .from(rates)
      .leftJoin(staff, eq(staff.id, rates.createdBy))
      .orderBy(desc(rates.effectiveFrom));
    const byType = (type: RateType) => {
      const list = rateRows.filter((r) => r.requestType === type);
      const current = list.find((r) => r.effectiveFrom <= today) ?? null;
      return list.map((r) => ({
        ...r,
        when: r.effectiveFrom > today ? ("upcoming" as const) : r.id === current?.id ? ("current" as const) : ("past" as const),
      }));
    };
    const settingRows = await tx
      .select({ key: settings.key, updatedAt: settings.updatedAt, updatedBy: staff.fullName })
      .from(settings)
      .leftJoin(staff, eq(staff.id, settings.updatedBy));
    const changed = Object.fromEntries(settingRows.filter((s) => s.updatedBy).map((s) => [s.key, { at: s.updatedAt, by: s.updatedBy! }]));
    const all = await readSettings(tx);
    const rules: Rules = {
      homeTripRule: all.homeTripRule,
      bulkApproveMaxCents: all.bulkApproveMaxCents,
      requireSite: all.requireSite,
      maxTripAgeDays: all.maxTripAgeDays,
      sessionDays: all.sessionDays,
      phoneMonthsPerClaim: all.phoneMonthsPerClaim,
      phonePeriodsBack: all.phonePeriodsBack,
    };
    return { today, rates: { mileage: byType("mileage"), phone: byType("phone") }, rules, changed };
  });
}

export async function addRate(viewer: Viewer, input: { type: RateType; rateCents: string; effectiveFrom: string; note: string }) {
  return withUser(viewer.userId, (tx) => addRateTx(tx, viewer.staffId, input));
}

export async function addRateTx(tx: Tx, staffId: string, input: { type: RateType; rateCents: string; effectiveFrom: string; note: string }) {
  if (!(input.type in RATE_TYPES)) throw new UserError("Choose which rate this is.");
  if (!isDate(input.effectiveFrom)) throw new UserError("Enter the date the rate starts.");
  const [same] = await tx
    .select({ id: rates.id })
    .from(rates)
    .where(and(eq(rates.requestType, input.type), eq(rates.effectiveFrom, input.effectiveFrom)))
    .limit(1);
  if (same) throw new UserError(`There's already a ${RATE_TYPES[input.type].label.toLowerCase()} rate starting ${longDay(input.effectiveFrom)}.`);
  const note = input.note.trim().slice(0, 300) || null;
  const [created] = await tx
    .insert(rates)
    .values({ requestType: input.type, rateCents: input.rateCents, effectiveFrom: input.effectiveFrom, note, createdBy: staffId })
    .returning({ id: rates.id });
  await logAdmin(
    tx,
    "rates",
    `${RATE_TYPES[input.type].label} rate from ${longDay(input.effectiveFrom)}: ${formatRateDollars(input.rateCents, input.type)}${note ? ` (${note})` : ""}`,
  );
  return created.id;
}

/** Deletes a rate that hasn't started yet. Rates in use stay, so the record of what was paid is complete. */
export async function deleteRate(viewer: Viewer, id: string) {
  if (!isUuid(id)) throw new UserError("Rate not found.");
  return withUser(viewer.userId, async (tx) => {
    const [rate] = await tx.select().from(rates).where(eq(rates.id, id)).limit(1);
    if (!rate) throw new UserError("Rate not found.");
    if (rate.effectiveFrom <= todayIso()) throw new UserError("A rate that has started can't be deleted. Add a new rate from the date it should change.");
    await tx.delete(rates).where(eq(rates.id, id));
    const type = rate.requestType as RateType;
    await logAdmin(tx, "rates", `Deleted the ${RATE_TYPES[type].label.toLowerCase()} rate from ${longDay(rate.effectiveFrom)} (${formatRateDollars(rate.rateCents, type)})`);
  });
}

/** Saves the rules that changed and records each change. Returns what changed. */
export async function saveRules(viewer: Viewer, next: Rules) {
  return withUser(viewer.userId, (tx) => saveRulesTx(tx, viewer.staffId, next));
}

export async function saveRulesTx(tx: Tx, staffId: string, next: Rules) {
  const current = await readSettings(tx);
  const changes: string[] = [];
  for (const key of Object.keys(RULE_KEYS) as (keyof Rules)[]) {
    if (current[key] === next[key]) continue;
    await setSetting(tx, staffId, RULE_KEYS[key], next[key]);
    changes.push(describeRule(key, next[key]));
  }
  if (changes.length) await logAdmin(tx, "rules", changes.join(". "));
  return changes;
}
