/**
 * Phone bill reimbursement: a flat monthly amount for using a personal phone for work ($45 a month
 * to start, an effective-dated rate in `rates`), claimed every few months.
 *
 * The year is split into claim periods from January. With 2 months per claim (the
 * `phone_months_per_claim` setting): January–February, March–April, … November–December. A period
 * can be claimed from the first day of its last month (the even months), so July–August opens on
 * August 1. Someone who missed a period can still claim it while it is one of the
 * `phone_periods_back` periods before the latest one. Each person can claim a month only once.
 *
 * Months are ISO dates of their first day: "2026-07-01".
 */

export type Month = string;

export type Period = {
  start: Month;
  end: Month;
  months: Month[];
  /** The day the period can be claimed: the first day of its last month. */
  opens: string;
  label: string;
};

/** Claim periods must divide the year evenly so they always start in January. */
export const MONTHS_PER_CLAIM_OPTIONS = [1, 2, 3, 4, 6, 12] as const;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-07-19" -> "2026-07-01" */
export function monthOf(isoDate: string): Month {
  return `${isoDate.slice(0, 7)}-01`;
}

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/** "2026-07-01" -> "July 2026" (or "July" without the year). */
export function formatMonth(month: Month, { withYear = true } = {}): string {
  const [y, m] = month.split("-").map(Number);
  return withYear ? `${MONTH_NAMES[m - 1]} ${y}` : MONTH_NAMES[m - 1];
}

/**
 * A readable list of months: "July 2026", "July–August 2026", "November 2026–January 2027", or
 * "May, July and August 2026" when they aren't in a row.
 */
export function formatMonths(months: Month[]): string {
  const sorted = [...new Set(months)].sort();
  if (sorted.length === 0) return "";
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length === 1) return formatMonth(first);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const inARow = sorted.every((m, i) => i === 0 || addMonths(sorted[i - 1], 1) === m);
  if (inARow) {
    return sameYear ? `${formatMonth(first, { withYear: false })}–${formatMonth(last)}` : `${formatMonth(first)}–${formatMonth(last)}`;
  }
  if (!sameYear) return sorted.map((m) => formatMonth(m)).join(", ");
  const names = sorted.map((m) => formatMonth(m, { withYear: false }));
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} ${first.slice(0, 4)}`;
}

export function validMonthsPerClaim(n: unknown): number {
  return MONTHS_PER_CLAIM_OPTIONS.includes(Number(n) as (typeof MONTHS_PER_CLAIM_OPTIONS)[number]) ? Number(n) : 2;
}

/** The claim period a month belongs to. */
export function periodOf(month: Month, monthsPerClaim: number): Period {
  const [y, m] = month.split("-").map(Number);
  const startMonth = Math.floor((m - 1) / monthsPerClaim) * monthsPerClaim + 1;
  const start = `${y}-${String(startMonth).padStart(2, "0")}-01`;
  const months = Array.from({ length: monthsPerClaim }, (_, i) => addMonths(start, i));
  const end = months[months.length - 1];
  return { start, end, months, opens: end, label: formatMonths(months) };
}

/** The newest period that can be claimed on `today` (its last month has started). */
export function latestOpenPeriod(today: string, monthsPerClaim: number): Period {
  const current = periodOf(monthOf(today), monthsPerClaim);
  return current.end === monthOf(today) ? current : periodOf(addMonths(current.start, -1), monthsPerClaim);
}

/** The next period to open after `today`. */
export function nextPeriod(today: string, monthsPerClaim: number): Period {
  return periodOf(addMonths(latestOpenPeriod(today, monthsPerClaim).end, 1), monthsPerClaim);
}

/** Periods that can be claimed on `today`, newest first: the latest open one and `periodsBack` before it. */
export function claimablePeriods(today: string, monthsPerClaim: number, periodsBack: number): Period[] {
  const periods = [latestOpenPeriod(today, monthsPerClaim)];
  for (let i = 0; i < Math.max(0, periodsBack); i++) {
    periods.push(periodOf(addMonths(periods[periods.length - 1].start, -1), monthsPerClaim));
  }
  return periods;
}

/** The amount for one month at `rateCents` cents per month, rounded half up to the cent. */
export function phoneAmountCents(rateCents: string | number): number {
  return Math.round(Number(rateCents));
}
