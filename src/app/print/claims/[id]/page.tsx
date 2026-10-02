import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintSheet } from "@/components/print-sheet";
import { requireViewer } from "@/lib/auth/viewer";
import { claimsForPrint } from "@/lib/data/claims";
import { formatDateTime } from "@/lib/format";
import { formatBytes } from "@/lib/files";
import { formatCents } from "@/lib/money";
import { formatMonth, formatMonths } from "@/lib/requests/phone";
import { MileageVoucher, tripMonths } from "./mileage-voucher";
import { ACTION_LABEL, STATUS_LABEL, claimNumber } from "@/lib/requests/status";
import { siteLabel } from "@/lib/sites";

export const metadata: Metadata = { title: "Print claim" };

export default async function PrintClaimPage({ params }: PageProps<"/print/claims/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const [claim] = await claimsForPrint(viewer, [id]);
  if (!claim) notFound();
  const submitted = claim.events.find((e) => e.action === "submitted" || e.action === "resubmitted");
  const isPhone = claim.type === "phone";
  const statements = isPhone
    ? ["I confirm I used my own phone for SCCSC work during these months."]
    : [
        "These trips were for SCCSC business, in my own vehicle, and the dates, places and miles are correct. My normal commute is not included.",
        "I certify I have a valid driver's license and vehicle coverage.",
        "I certify I obey all traffic laws and regulations.",
      ];

  return (
    <PrintSheet
      title={isPhone ? "Phone bill reimbursement claim" : "Mileage Claim Voucher"}
      subtitle={
        <>
          Claim {claimNumber(claim.ref, claim.type)} · {STATUS_LABEL[claim.status]}
        </>
      }
    >
      <dl className="grid grid-cols-4 gap-4">
        <div>
          <dt className="text-ink-500">Employee</dt>
          <dd className="font-semibold">{claim.ownerName}</dd>
        </div>
        <div>
          <dt className="text-ink-500">{isPhone ? "Months" : "Month/Year"}</dt>
          <dd className="font-semibold">{isPhone ? formatMonths(claim.phoneMonths.map((m) => m.month)) : tripMonths(claim.trips.map((t) => t.date))}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Submitted</dt>
          <dd className="font-semibold">{claim.submittedAt ? formatDateTime(claim.submittedAt) : "Not yet"}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Total</dt>
          <dd className="font-display text-lg font-semibold">{formatCents(claim.totalCents)}</dd>
        </div>
      </dl>

      {isPhone ? (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-ink text-[12px]">
              <th className="py-1.5 pr-2 font-semibold">Month</th>
              <th className="py-1.5 pr-2 font-semibold">School or site</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Rate</th>
              <th className="py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {claim.phoneMonths.map((m) => (
              <tr key={m.id} className="border-b border-ink-100">
                <td className="py-1.5 pr-2">{formatMonth(m.month)}</td>
                <td className="py-1.5 pr-2">{siteLabel(m.siteCode ? { code: m.siteCode, name: m.siteName ?? "" } : null)}</td>
                <td className="py-1.5 pr-2 text-right">{formatCents(Math.round(Number(m.rateCents)))} a month</td>
                <td className="py-1.5 text-right">{formatCents(m.amountCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-semibold">
              <td className="py-2" colSpan={3}>
                Total ({claim.phoneMonths.length} {claim.phoneMonths.length === 1 ? "month" : "months"})
              </td>
              <td className="py-2 text-right">{formatCents(claim.totalCents)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <MileageVoucher trips={claim.trips} />
      )}

      {claim.attachments.length > 0 ? (
        <p>
          <span className="font-semibold">{isPhone ? "Copy of the bill" : "Files"}:</span>{" "}
          {claim.attachments.map((f) => `${f.fileName} (${formatBytes(f.sizeBytes)})`).join(", ")}. Kept with the claim in the app.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-[var(--radius-btn)] border border-ink-100 p-3">
          <p className="font-semibold">Employee&apos;s signature</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {statements.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-1">
            {submitted ? `Confirmed and submitted electronically by ${submitted.actorName} on ${formatDateTime(submitted.createdAt)}.` : "Not submitted yet."}
          </p>
        </div>
        <div className="rounded-[var(--radius-btn)] border border-ink-100 p-3">
          <p className="font-semibold">Supervisor&apos;s signature</p>
          <p className="mt-1">
            {claim.approval
              ? `Approved electronically by ${claim.approval.actorName} on ${formatDateTime(claim.approval.createdAt)}.`
              : "Not approved yet."}
          </p>
        </div>
      </div>

      <div>
        <p className="font-semibold">History</p>
        <ul className="mt-1 space-y-0.5">
          {claim.events.map((e) => (
            <li key={e.id}>
              {formatDateTime(e.createdAt)}: {ACTION_LABEL[e.action]} by {e.actorName}
              {e.comment ? ` (“${e.comment}”)` : ""}
            </li>
          ))}
        </ul>
      </div>
    </PrintSheet>
  );
}
