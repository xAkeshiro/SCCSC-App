/**
 * The kinds of request (reimbursement) the app handles. Each has a row in `request_types`, a details
 * table for its items, and a module here (./mileage.ts, ./phone.ts). Claims, review, batches and
 * payment are shared.
 */
import { formatDay, plural } from "@/lib/format";
import { formatMonths } from "./phone";

export type RequestType = "mileage" | "phone";

export const REQUEST_TYPES: Record<RequestType, { label: string; prefix: string; item: string; items: string }> = {
  mileage: { label: "Mileage", prefix: "M", item: "trip", items: "trips" },
  phone: { label: "Phone bill", prefix: "P", item: "month", items: "months" },
};

export function asRequestType(value: string): RequestType {
  return value === "phone" ? "phone" : "mileage";
}

/** "3 trips · Sep 2 to Sep 20" or "2 months · July–August 2026". */
export function itemsSummary(type: RequestType, count: number, firstDate: string | null, lastDate: string | null): string {
  const t = REQUEST_TYPES[type];
  if (count === 0 || !firstDate || !lastDate) return `No ${t.items}`;
  if (type === "phone") {
    const months = count === 1 || firstDate === lastDate ? [firstDate] : [firstDate, lastDate];
    // Months in a phone claim are usually in a row; show the range they span.
    return `${plural(count, t.item, t.items)} · ${count > 2 ? `${formatMonths([firstDate])} to ${formatMonths([lastDate])}` : formatMonths(months)}`;
  }
  const span =
    firstDate === lastDate
      ? formatDay(firstDate, { weekday: false })
      : `${formatDay(firstDate, { weekday: false })} to ${formatDay(lastDate, { weekday: false })}`;
  return `${plural(count, t.item, t.items)} · ${span}`;
}
