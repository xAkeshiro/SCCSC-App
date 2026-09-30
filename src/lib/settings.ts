import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { settings } from "@/db/schema";
import { validMonthsPerClaim } from "@/lib/requests/phone";

export type Settings = {
  homeTripRule: "allow" | "flag" | "block";
  bulkApproveMaxCents: number;
  requireProgram: boolean;
  sessionDays: number;
  maxTripAgeDays: number;
  /** Phone bills are claimed this many months at a time (periods start in January). */
  phoneMonthsPerClaim: number;
  /** How many earlier periods can still be claimed after the latest one opens. */
  phonePeriodsBack: number;
};

const DEFAULTS: Settings = {
  homeTripRule: "flag",
  bulkApproveMaxCents: 10000,
  requireProgram: true,
  sessionDays: 30,
  maxTripAgeDays: 365,
  phoneMonthsPerClaim: 2,
  phonePeriodsBack: 1,
};

export async function readSettings(tx: Tx): Promise<Settings> {
  const all = await tx.select().from(settings);
  const get = (key: string) => all.find((s) => s.key === key)?.value;
  const rule = get("home_trip_rule");
  return {
    homeTripRule: rule === "allow" || rule === "block" || rule === "flag" ? rule : DEFAULTS.homeTripRule,
    bulkApproveMaxCents: Number(get("bulk_approve_max_cents") ?? DEFAULTS.bulkApproveMaxCents),
    requireProgram: get("require_program") === undefined ? DEFAULTS.requireProgram : Boolean(get("require_program")),
    sessionDays: Number(get("session_days") ?? DEFAULTS.sessionDays) || DEFAULTS.sessionDays,
    maxTripAgeDays: Number(get("max_trip_age_days") ?? DEFAULTS.maxTripAgeDays) || DEFAULTS.maxTripAgeDays,
    phoneMonthsPerClaim: validMonthsPerClaim(get("phone_months_per_claim") ?? DEFAULTS.phoneMonthsPerClaim),
    phonePeriodsBack: Math.min(12, Math.max(0, Math.floor(Number(get("phone_periods_back") ?? DEFAULTS.phonePeriodsBack) || 0))),
  };
}

export async function readSetting(tx: Tx, key: string) {
  const [row] = await tx.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value;
}
