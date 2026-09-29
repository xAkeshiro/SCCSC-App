import { dollars, toCsv } from "@/lib/csv";
import type { BatchDetail } from "@/lib/data/finance";
import { batchNumber, claimNumber } from "@/lib/requests/status";

/**
 * Batch export files. The financial system's import format is still an open question
 * (brief, open question 1), so these are two generic layouts finance can map or paste from:
 * - detail: one row per trip (everything the IRS expects: date, destination, purpose, miles).
 * - summary: one row per employee and program, the lines a payment or journal entry needs.
 */
export function batchCsv(batch: BatchDetail, format: "detail" | "summary"): string {
  const b = batchNumber(batch.ref);
  if (format === "summary") {
    const rows = new Map<string, { employee: string; program: string; trips: number; miles: number; cents: number }>();
    for (const c of batch.claims) {
      for (const t of c.trips) {
        const key = `${c.ownerName}|${t.programCode ?? ""}`;
        const row = rows.get(key) ?? { employee: c.ownerName, program: t.programCode ?? "", trips: 0, miles: 0, cents: 0 };
        row.trips += 1;
        row.miles += Number(t.miles);
        row.cents += t.amountCents;
        rows.set(key, row);
      }
    }
    return toCsv(
      ["Batch", "Pay period start", "Pay period end", "Employee", "Program code", "Trips", "Miles", "Amount"],
      [...rows.values()]
        .sort((x, y) => x.employee.localeCompare(y.employee) || x.program.localeCompare(y.program))
        .map((r) => [b, batch.periodStart, batch.periodEnd, r.employee, r.program, r.trips, r.miles.toFixed(1), dollars(r.cents)]),
    );
  }
  return toCsv(
    [
      "Batch",
      "Pay period start",
      "Pay period end",
      "Claim",
      "Employee",
      "Trip date",
      "From",
      "Stops",
      "To",
      "Round trip",
      "Business purpose",
      "Program code",
      "Miles",
      "Rate (cents per mile)",
      "Amount",
      "Approved by",
      "Approved on",
    ],
    batch.claims.flatMap((c) =>
      c.trips.map((t) => [
        b,
        batch.periodStart,
        batch.periodEnd,
        claimNumber(c.ref),
        c.ownerName,
        t.date,
        t.fromLabel,
        t.stops.map((s) => s.label).join("; "),
        t.toLabel,
        t.roundTrip,
        t.purpose,
        t.programCode ?? "",
        Number(t.miles).toFixed(1),
        Number(t.rateCents).toFixed(2),
        dollars(t.amountCents),
        c.approvedBy ?? "",
        c.approvedAt ? c.approvedAt.toISOString().slice(0, 10) : "",
      ]),
    ),
  );
}
