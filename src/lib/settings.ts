import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { settings } from "@/db/schema";
import { validMonthsPerClaim } from "@/lib/requests/phone";

/**
 * Which Aplos account each kind of reimbursement goes to (account numbers). Trips and their parking
 * follow the trip's direct or indirect choice; phone bills use one account.
 */
export type AccountMapping = {
  mileageDirect: string;
  mileageIndirect: string;
  parkingDirect: string;
  parkingIndirect: string;
  phone: string;
};

export const ACCOUNT_MAPPING_DEFAULTS: AccountMapping = {
  mileageDirect: "5702",
  mileageIndirect: "5700",
  parkingDirect: "5703",
  parkingIndirect: "5701",
  phone: "5430",
};

export type Settings = {
  homeTripRule: "allow" | "flag" | "block";
  bulkApproveMaxCents: number;
  /** Every trip and phone bill must say which school or site it's for. */
  requireSite: boolean;
  sessionDays: number;
  maxTripAgeDays: number;
  /** Phone bills are claimed this many months at a time (periods start in January). */
  phoneMonthsPerClaim: number;
  /** How many earlier periods can still be claimed after the latest one opens. */
  phonePeriodsBack: number;
  aplosAccounts: AccountMapping;
};

const DEFAULTS: Settings = {
  homeTripRule: "flag",
  bulkApproveMaxCents: 10000,
  requireSite: true,
  sessionDays: 30,
  maxTripAgeDays: 365,
  phoneMonthsPerClaim: 2,
  phonePeriodsBack: 1,
  aplosAccounts: ACCOUNT_MAPPING_DEFAULTS,
};

function accountMapping(value: unknown): AccountMapping {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const pick = (key: keyof AccountMapping) => (typeof v[key] === "string" && /^\d+$/.test(v[key] as string) ? (v[key] as string) : ACCOUNT_MAPPING_DEFAULTS[key]);
  return {
    mileageDirect: pick("mileageDirect"),
    mileageIndirect: pick("mileageIndirect"),
    parkingDirect: pick("parkingDirect"),
    parkingIndirect: pick("parkingIndirect"),
    phone: pick("phone"),
  };
}

export async function readSettings(tx: Tx): Promise<Settings> {
  const all = await tx.select().from(settings);
  const get = (key: string) => all.find((s) => s.key === key)?.value;
  const rule = get("home_trip_rule");
  return {
    homeTripRule: rule === "allow" || rule === "block" || rule === "flag" ? rule : DEFAULTS.homeTripRule,
    bulkApproveMaxCents: Number(get("bulk_approve_max_cents") ?? DEFAULTS.bulkApproveMaxCents),
    requireSite: get("require_site") === undefined ? DEFAULTS.requireSite : Boolean(get("require_site")),
    sessionDays: Number(get("session_days") ?? DEFAULTS.sessionDays) || DEFAULTS.sessionDays,
    maxTripAgeDays: Number(get("max_trip_age_days") ?? DEFAULTS.maxTripAgeDays) || DEFAULTS.maxTripAgeDays,
    phoneMonthsPerClaim: validMonthsPerClaim(get("phone_months_per_claim") ?? DEFAULTS.phoneMonthsPerClaim),
    phonePeriodsBack: Math.min(12, Math.max(0, Math.floor(Number(get("phone_periods_back") ?? DEFAULTS.phonePeriodsBack) || 0))),
    aplosAccounts: accountMapping(get("aplos_accounts")),
  };
}

export async function readSetting(tx: Tx, key: string) {
  const [row] = await tx.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value;
}
