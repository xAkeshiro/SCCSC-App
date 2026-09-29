import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { settings } from "@/db/schema";

export type Settings = {
  homeTripRule: "allow" | "flag" | "block";
  bulkApproveMaxCents: number;
  requireProgram: boolean;
  sessionDays: number;
  maxTripAgeDays: number;
};

const DEFAULTS: Settings = { homeTripRule: "flag", bulkApproveMaxCents: 10000, requireProgram: true, sessionDays: 30, maxTripAgeDays: 365 };

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
  };
}

export async function readSetting(tx: Tx, key: string) {
  const [row] = await tx.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value;
}
