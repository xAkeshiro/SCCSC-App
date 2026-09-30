import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/print-sheet";
import { hasRole, requireViewer } from "@/lib/auth/viewer";
import { batchDetail } from "@/lib/data/finance";
import { formatDateTime, formatDay } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { formatMonths } from "@/lib/requests/phone";
import { batchNumber, claimNumber } from "@/lib/requests/status";

export const metadata: Metadata = { title: "Print batch" };

export default async function PrintBatchPage({ params }: PageProps<"/print/batches/[id]">) {
  const viewer = await requireViewer();
  if (!hasRole(viewer, "finance", "admin")) notFound();
  const { id } = await params;
  const batch = await batchDetail(viewer, id);
  if (!batch) notFound();
  const status = batch.status === "paid" ? `Paid ${formatDay(batch.paidOn!, { withYear: true, weekday: false })}` : batch.status === "exported" ? "Exported" : "Open";

  return (
    <PrintSheet
      title="Reimbursement payment batch"
      subtitle={
        <>
          Batch {batchNumber(batch.ref)} · {status}
        </>
      }
    >
      <dl className="grid grid-cols-3 gap-4">
        <div>
          <dt className="text-ink-500">Pay period</dt>
          <dd className="font-semibold">
            {formatDay(batch.periodStart, { weekday: false, withYear: true })} to {formatDay(batch.periodEnd, { weekday: false, withYear: true })}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Prepared by</dt>
          <dd className="font-semibold">{batch.createdBy ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Total</dt>
          <dd className="font-display text-lg font-semibold">{formatCents(batch.totalCents)}</dd>
        </div>
      </dl>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-ink text-[12px]">
            <th className="py-1.5 pr-2 font-semibold">Employee</th>
            <th className="py-1.5 pr-2 font-semibold">Claim</th>
            <th className="py-1.5 pr-2 font-semibold">For</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Miles</th>
            <th className="py-1.5 pr-2 font-semibold">Approved</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {batch.claims.map((c) => (
            <tr key={c.id} className="border-b border-ink-100 align-top">
              <td className="py-1.5 pr-2">{c.ownerName}</td>
              <td className="py-1.5 pr-2">{claimNumber(c.ref, c.type)}</td>
              <td className="py-1.5 pr-2">
                {c.type === "phone" ? `Phone bill, ${formatMonths(c.phoneMonths.map((m) => m.month))}` : `${c.trips.length} ${c.trips.length === 1 ? "trip" : "trips"}`}
              </td>
              <td className="py-1.5 pr-2 text-right">{c.type === "phone" ? "—" : c.miles.toFixed(1)}</td>
              <td className="py-1.5 pr-2">{c.approvedBy ? `${c.approvedBy}, ${c.approvedAt ? formatDateTime(c.approvedAt) : ""}` : "—"}</td>
              <td className="py-1.5 text-right">{formatCents(c.totalCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink font-semibold">
            <td className="py-2" colSpan={5}>
              Total ({batch.claims.length} claims)
            </td>
            <td className="py-2 text-right">{formatCents(batch.totalCents)}</td>
          </tr>
        </tfoot>
      </table>

      <div>
        <p className="font-semibold">By program or grant</p>
        <table className="mt-1 w-full max-w-md border-collapse text-left">
          <tbody>
            {batch.byProgram.map((p) => (
              <tr key={p.code} className="border-b border-ink-100">
                <td className="py-1 pr-2">
                  {p.code}: {p.name}
                </td>
                <td className="py-1 pr-2 text-right">
                  {[p.trips ? `${p.miles.toFixed(1)} mi` : null, p.months ? `${p.months} phone ${p.months === 1 ? "month" : "months"}` : null]
                    .filter(Boolean)
                    .join(", ")}
                </td>
                <td className="py-1 text-right">{formatCents(p.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-500">
        {batch.exportedAt ? `File exported ${formatDateTime(batch.exportedAt)}${batch.exportedBy ? ` by ${batch.exportedBy}` : ""}. ` : ""}
        {batch.paidOn ? `Marked paid${batch.paidBy ? ` by ${batch.paidBy}` : ""}.` : ""}
      </p>
    </PrintSheet>
  );
}
