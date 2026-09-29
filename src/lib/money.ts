/**
 * Money and mileage math without floating point.
 * - Amounts are integer cents.
 * - Rates are exact decimals in cents per mile (e.g. "72.50"), as stored in Postgres numeric.
 * - Miles have one decimal place (e.g. "12.4").
 */

/** Parses a non-negative decimal string into an integer scaled by 10^scale. "12.4", 1 -> 124. */
export function toScaledInt(value: string | number, scale: number): number | null {
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const whole = match[1];
  const frac = (match[2] ?? "").padEnd(scale + 1, "0");
  // Round half up on the first dropped digit.
  let scaled = Number(whole) * 10 ** scale + (scale > 0 ? Number(frac.slice(0, scale)) : 0);
  if (Number(frac[scale]) >= 5) scaled += 1;
  return scaled;
}

/** Miles rounded to one decimal, as a string ("12.4"). */
export function normalizeMiles(value: string | number): string | null {
  const tenths = toScaledInt(value, 1);
  if (tenths === null) return null;
  return (tenths / 10).toFixed(1);
}

/** Reimbursement for `miles` at `rateCents` cents per mile, rounded half up to the cent. */
export function mileageAmountCents(miles: string | number, rateCents: string | number): number {
  const tenths = toScaledInt(miles, 1);
  const hundredths = toScaledInt(rateCents, 2);
  if (tenths === null || hundredths === null) throw new Error("Invalid miles or rate");
  // tenths of a mile x hundredths of a cent = thousandths of a cent.
  return Math.floor((tenths * hundredths + 500) / 1000);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

export function formatMiles(miles: string | number): string {
  const n = Number(miles);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
}

/** "72.5¢ per mile" */
export function formatRate(rateCents: string | number): string {
  const n = Number(rateCents);
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}¢ per mile`;
}
