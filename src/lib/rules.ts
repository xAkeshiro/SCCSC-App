/**
 * The business rules admins can change (the `settings` table), and reimbursement rates: what the
 * forms accept and how a change reads in the admin history.
 */
import { dollarsToCents, formatCents, toScaledInt } from "@/lib/money";
import { MONTHS_PER_CLAIM_OPTIONS } from "@/lib/requests/phone";

export type HomeTripRule = "allow" | "flag" | "block";

export type Rules = {
  homeTripRule: HomeTripRule;
  bulkApproveMaxCents: number;
  requireSite: boolean;
  maxTripAgeDays: number;
  sessionDays: number;
  phoneMonthsPerClaim: number;
  phonePeriodsBack: number;
};

/** The settings key each rule is stored under. */
export const RULE_KEYS: Record<keyof Rules, string> = {
  homeTripRule: "home_trip_rule",
  bulkApproveMaxCents: "bulk_approve_max_cents",
  requireSite: "require_site",
  maxTripAgeDays: "max_trip_age_days",
  sessionDays: "session_days",
  phoneMonthsPerClaim: "phone_months_per_claim",
  phonePeriodsBack: "phone_periods_back",
};

export const HOME_TRIP_RULES: { value: HomeTripRule; label: string }[] = [
  { value: "allow", label: "Allow them" },
  { value: "flag", label: "Allow them, and point them out to the reviewer" },
  { value: "block", label: "Don't allow them" },
];

export type RulesFields = Record<Exclude<keyof Rules, "requireSite">, string> & { requireSite: boolean };
export type RulesErrors = Partial<Record<keyof Rules, string>>;

function wholeNumber(text: string, min: number, max: number) {
  const n = /^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function checkRules(f: RulesFields): { rules: Rules | null; errors: RulesErrors } {
  const errors: RulesErrors = {};
  const homeTripRule = HOME_TRIP_RULES.find((r) => r.value === f.homeTripRule)?.value;
  if (!homeTripRule) errors.homeTripRule = "Choose what happens with trips from home.";
  const bulk = dollarsToCents(f.bulkApproveMaxCents);
  if (bulk === null || bulk > 1_000_000) errors.bulkApproveMaxCents = "Enter an amount up to $10,000, or 0 to turn bulk approval off.";
  const maxTripAgeDays = wholeNumber(f.maxTripAgeDays, 7, 1095);
  if (maxTripAgeDays === null) errors.maxTripAgeDays = "Enter a number of days from 7 to 1095.";
  const sessionDays = wholeNumber(f.sessionDays, 1, 90);
  if (sessionDays === null) errors.sessionDays = "Enter a number of days from 1 to 90.";
  const months = Number(f.phoneMonthsPerClaim);
  const phoneMonthsPerClaim = MONTHS_PER_CLAIM_OPTIONS.find((m) => m === months);
  if (!phoneMonthsPerClaim) errors.phoneMonthsPerClaim = "Choose how many months a phone bill claim covers.";
  const phonePeriodsBack = wholeNumber(f.phonePeriodsBack, 0, 12);
  if (phonePeriodsBack === null) errors.phonePeriodsBack = "Enter a number from 0 to 12.";
  if (Object.keys(errors).length) return { rules: null, errors };
  return {
    rules: {
      homeTripRule: homeTripRule!,
      bulkApproveMaxCents: bulk!,
      requireSite: f.requireSite,
      maxTripAgeDays: maxTripAgeDays!,
      sessionDays: sessionDays!,
      phoneMonthsPerClaim: phoneMonthsPerClaim!,
      phonePeriodsBack: phonePeriodsBack!,
    },
    errors,
  };
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** A rule's value in words, for the history: "Trips from home: don't allow them". */
export function describeRule<K extends keyof Rules>(key: K, value: Rules[K]): string {
  switch (key) {
    case "homeTripRule":
      return `Trips from home: ${HOME_TRIP_RULES.find((r) => r.value === value)?.label.toLowerCase() ?? value}`;
    case "bulkApproveMaxCents":
      return value ? `Bulk approval: claims up to ${formatCents(value as number)}` : "Bulk approval: off";
    case "requireSite":
      return value ? "School or site: required" : "School or site: optional";
    case "maxTripAgeDays":
      return `Oldest trip that can be logged: ${days(value as number)}`;
    case "sessionDays":
      return `Stay signed in for: ${days(value as number)}`;
    case "phoneMonthsPerClaim":
      return `Phone bills: ${value} ${value === 1 ? "month" : "months"} per claim`;
    case "phonePeriodsBack":
      return `Phone bills: ${value} earlier ${value === 1 ? "period" : "periods"} can still be claimed`;
  }
  return String(value);
}

// ---------------------------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------------------------

export type RateType = "mileage" | "phone";

export const RATE_TYPES: Record<RateType, { label: string; per: string; field: string; example: string; max: number }> = {
  mileage: { label: "Mileage", per: "mile", field: "Dollars per mile", example: "0.725", max: 500 },
  phone: { label: "Phone bills", per: "month", field: "Dollars per month", example: "45.00", max: 50_000 },
};

/** "0.725" dollars → "72.50" cents (as stored), or null. Up to a hundredth of a cent. */
export function parseRate(text: string, type: RateType): string | null {
  const hundredthsOfCent = toScaledInt(text.replace(/[$,\s]/g, ""), 4);
  if (hundredthsOfCent === null || hundredthsOfCent <= 0 || hundredthsOfCent > RATE_TYPES[type].max * 100) return null;
  return (hundredthsOfCent / 100).toFixed(2);
}

/** "72.50" cents → "$0.725 a mile"; "4500.00" → "$45.00 a month". */
export function formatRateDollars(rateCents: string | number, type: RateType) {
  const dollars = Number(rateCents) / 100;
  const text = dollars.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return `${text} a ${RATE_TYPES[type].per}`;
}
