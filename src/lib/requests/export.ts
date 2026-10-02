import { dollars, toCsv } from "@/lib/csv";
import type { BatchDetail } from "@/lib/data/finance";
import { formatMonth } from "@/lib/requests/phone";
import { batchNumber, claimNumber } from "@/lib/requests/status";
import { REQUEST_TYPES } from "@/lib/requests/types";

/**
 * Batch export files. The financial system's import format is still an open question
 * (brief, open question 1), so these are two generic layouts finance can map or paste from:
 * - detail: one row per trip or phone bill month (for trips, everything the IRS expects: date,
 *   destination, purpose, miles).
 * - summary: one row per employee, school or site and type.
 */
export function batchCsv(batch: BatchDetail, format: "detail" | "summary"): string {
  const b = batchNumber(batch.ref);
  if (format === "summary") {
    const rows = new Map<string, { employee: string; site: string; type: string; items: number; miles: number; cents: number }>();
    const add = (employee: string, site: string | null, type: keyof typeof REQUEST_TYPES, miles: number, cents: number) => {
      const key = `${employee}|${site ?? ""}|${type}`;
      const row = rows.get(key) ?? { employee, site: site ?? "", type: REQUEST_TYPES[type].label, items: 0, miles: 0, cents: 0 };
      row.items += 1;
      row.miles += miles;
      row.cents += cents;
      rows.set(key, row);
    };
    for (const c of batch.claims) {
      for (const t of c.trips) add(c.ownerName, t.siteCode, "mileage", Number(t.miles), t.amountCents);
      for (const m of c.phoneMonths) add(c.ownerName, m.siteCode, "phone", 0, m.amountCents);
    }
    return toCsv(
      ["Batch", "Pay period start", "Pay period end", "Employee", "School or site", "Type", "Trips or months", "Miles", "Amount"],
      [...rows.values()]
        .sort((x, y) => x.employee.localeCompare(y.employee) || x.site.localeCompare(y.site) || x.type.localeCompare(y.type))
        .map((r) => [b, batch.periodStart, batch.periodEnd, r.employee, r.site, r.type, r.items, r.miles.toFixed(1), dollars(r.cents)]),
    );
  }
  return toCsv(
    [
      "Batch",
      "Pay period start",
      "Pay period end",
      "Claim",
      "Employee",
      "Type",
      "Date",
      "From",
      "Stops",
      "To",
      "Round trip",
      "Business purpose",
      "School or site",
      "Miles",
      "Rate (cents)",
      "Rate per",
      "Amount",
      "Approved by",
      "Approved on",
    ],
    batch.claims.flatMap((c) => {
      const approval = [c.approvedBy ?? "", c.approvedAt ? c.approvedAt.toISOString().slice(0, 10) : ""];
      const start = [b, batch.periodStart, batch.periodEnd, claimNumber(c.ref, c.type), c.ownerName];
      return [
        ...c.trips.map((t) => [
          ...start,
          REQUEST_TYPES.mileage.label,
          t.date,
          t.fromLabel,
          t.stops.map((s) => s.label).join("; "),
          t.toLabel,
          t.roundTrip,
          t.purpose,
          t.siteCode ?? "",
          Number(t.miles).toFixed(1),
          Number(t.rateCents).toFixed(2),
          "mile",
          dollars(t.amountCents),
          ...approval,
        ]),
        ...c.phoneMonths.map((m) => [
          ...start,
          REQUEST_TYPES.phone.label,
          m.month,
          "",
          "",
          "",
          "",
          `Phone bill, ${formatMonth(m.month)}`,
          m.siteCode ?? "",
          "",
          Number(m.rateCents).toFixed(2),
          "month",
          dollars(m.amountCents),
          ...approval,
        ]),
      ];
    }),
  );
}
