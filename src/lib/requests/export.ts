import { dollars, toCsv } from "@/lib/csv";
import type { BatchDetail } from "@/lib/data/finance";
import { budgetCode } from "@/lib/budget-codes";
import { mileageLabel, phoneLabel } from "@/lib/requests/aplos";
import { formatMonth } from "@/lib/requests/phone";
import { batchNumber, claimNumber } from "@/lib/requests/status";
import { REQUEST_TYPES } from "@/lib/requests/types";

/**
 * The batch's trip detail: one row per trip or phone bill month, with everything the IRS expects
 * for a trip (date, destination, purpose, miles), its budget code and its Aplos label. The payments
 * themselves go to Aplos as an Excel file (`aplos.ts`).
 */
export function batchCsv(batch: BatchDetail): string {
  const b = batchNumber(batch.ref);
  const m = batch.accountMapping;
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
      "Direct or indirect",
      "School or site",
      "Budget code",
      "Label",
      "Miles",
      "Rate (cents)",
      "Rate per",
      "Parking",
      "Amount",
      "Approved by",
      "Approved on",
    ],
    batch.claims.flatMap((c) => {
      const approval = [c.approvedBy ?? "", c.approvedAt ? c.approvedAt.toISOString().slice(0, 10) : ""];
      const start = [b, batch.periodStart, batch.periodEnd, claimNumber(c.ref, c.type), c.ownerName];
      const milLabel = c.trips.length ? mileageLabel(c.trips.map((t) => t.date)) : "";
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
          t.costType === "direct" ? "Direct" : t.costType === "indirect" ? "Indirect" : "",
          t.siteCode ?? "",
          budgetCode(t.costType === "direct" ? m.mileageDirect : t.costType === "indirect" ? m.mileageIndirect : null, t.fundCode, t.siteCode),
          milLabel,
          Number(t.miles).toFixed(1),
          Number(t.rateCents).toFixed(2),
          "mile",
          t.parkingCents ? dollars(t.parkingCents) : "",
          dollars(t.amountCents),
          ...approval,
        ]),
        ...c.phoneMonths.map((p) => [
          ...start,
          REQUEST_TYPES.phone.label,
          p.month,
          "",
          "",
          "",
          "",
          `Phone bill, ${formatMonth(p.month)}`,
          "",
          p.siteCode ?? "",
          budgetCode(m.phone, p.fundCode, p.siteCode),
          phoneLabel(p.month, batch.phoneMonthsPerClaim),
          "",
          Number(p.rateCents).toFixed(2),
          "month",
          "",
          dollars(p.amountCents),
          ...approval,
        ]),
      ];
    }),
  );
}
