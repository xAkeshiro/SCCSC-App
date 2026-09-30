import { ArrowLeft, Check, Printer, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchStatusBadge } from "@/components/batch-status";
import { ConfirmButton } from "@/components/confirm-button";
import { ButtonLink, Card, Container, Eyebrow, Notice, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { batchDetail } from "@/lib/data/finance";
import { formatDateTime, formatDay, plural, todayIso } from "@/lib/format";
import { formatCents, formatMiles } from "@/lib/money";
import { formatMonths } from "@/lib/requests/phone";
import { batchNumber, claimNumber } from "@/lib/requests/status";
import { unbatchClaim } from "../../actions";
import { ExportButtons, MarkPaidForm } from "./batch-actions";

export const metadata: Metadata = { title: "Batch" };

const DONE: Record<string, string> = {
  created: "Batch created. Next, download the file for the financial system.",
  added: "Claims added to the batch.",
  removed: "Claim removed from the batch. It's back in the list of approved claims.",
  paid: "Batch marked as paid. Everyone in it can see their claim is paid.",
};

export default async function BatchPage({ params, searchParams }: PageProps<"/finance/batches/[id]">) {
  const viewer = await requireRole("finance", "admin");
  const { id } = await params;
  const { done, error } = await searchParams;
  const batch = await batchDetail(viewer, id);
  if (!batch) notFound();
  const name = batchNumber(batch.ref);
  const miles = batch.claims.reduce((n, c) => n + c.miles, 0);
  const steps = [
    { label: "Check the claims", done: true },
    { label: "Download the file", done: batch.status !== "open" },
    { label: "Mark as paid", done: batch.status === "paid" },
  ];

  return (
    <Container className="py-8">
      <Link href="/finance" className="mb-4 inline-flex min-h-10 items-center gap-1.5 font-display font-medium text-brand-600 hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Finance
      </Link>
      <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>Payment batch</Eyebrow>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-[1.75rem] sm:text-4xl">
            Batch {name} <BatchStatusBadge status={batch.status} className="text-sm" />
          </h1>
          <p className="mt-2 text-ink-500">
            Pay period {formatDay(batch.periodStart, { weekday: false })} to {formatDay(batch.periodEnd, { weekday: false, withYear: true })}
            {batch.createdBy ? ` · made by ${batch.createdBy}` : ""}
          </p>
        </div>
        <ButtonLink href={`/print/batches/${batch.id}`} variant="secondary" target="_blank">
          <Printer aria-hidden className="size-4" /> Print summary
        </ButtonLink>
      </div>

      {typeof done === "string" && DONE[done] ? (
        <Notice tone="success" className="mb-6">
          {DONE[done]}
        </Notice>
      ) : null}
      {typeof error === "string" ? (
        <Notice tone="error" className="mb-6">
          {error}
        </Notice>
      ) : null}

      <ol className="mb-8 grid gap-2 sm:grid-cols-3" aria-label="Steps">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={cx(
              "flex items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3",
              s.done ? "border-status-approved/25 bg-status-approved-bg text-status-approved" : "border-ink-100 bg-white",
            )}
          >
            <span className={cx("grid size-7 place-items-center rounded-full text-sm font-semibold", s.done ? "bg-status-approved text-white" : "bg-ink-50 text-ink-700")}>
              {s.done ? <Check aria-hidden className="size-4" /> : i + 1}
            </span>
            <span className="font-semibold">{s.label}</span>
            <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          <section aria-labelledby="claims">
            <h2 id="claims" className="text-2xl">
              Claims in this batch
            </h2>
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left">
                <thead className="border-b border-ink-100 text-sm text-ink-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Employee</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Claim</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Approved by</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                    {batch.status === "open" ? <th scope="col" className="px-5 py-3"><span className="sr-only">Remove</span></th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {batch.claims.map((c) => (
                    <tr key={c.id}>
                      <td className="px-5 py-3 font-semibold">{c.ownerName}</td>
                      <td className="px-5 py-3">
                        <Link href={`/claims/${c.id}`} className="text-brand-600 hover:underline">
                          {claimNumber(c.ref, c.type)}
                        </Link>
                        <span className="block text-sm text-ink-500">
                          {c.type === "phone"
                            ? `Phone bill, ${formatMonths(c.phoneMonths.map((m) => m.month))}`
                            : `${plural(c.trips.length, "trip")}, ${formatMiles(c.miles)}`}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm">{c.approvedBy ?? "—"}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatCents(c.totalCents)}</td>
                      {batch.status === "open" ? (
                        <td className="px-3 py-3 text-right">
                          <form action={unbatchClaim.bind(null, batch.id, c.id)}>
                            <ConfirmButton variant="ghost" size="sm" confirm={`Take ${c.ownerName}'s claim out of this batch?`}>
                              <X aria-hidden className="size-4" />
                              <span className="sr-only">Remove {c.ownerName}&apos;s claim from the batch</span>
                            </ConfirmButton>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-ink-100 font-semibold">
                  <tr>
                    <td className="px-5 py-3" colSpan={3}>
                      Total ({plural(batch.claims.length, "claim")}, {formatMiles(miles)})
                    </td>
                    <td className="px-5 py-3 text-right font-display text-lg text-brand-600">{formatCents(batch.totalCents)}</td>
                    {batch.status === "open" ? <td /> : null}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section aria-labelledby="programs">
            <h2 id="programs" className="text-2xl">
              By program
            </h2>
            <ul className="card mt-4 divide-y divide-ink-100">
              {batch.byProgram.map((p) => (
                <li key={p.code} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span>
                    <span className="font-semibold">{p.code}</span> <span className="text-ink-500">{p.name}</span>
                    <span className="block text-sm text-ink-500">
                      {[p.trips ? `${plural(p.trips, "trip")}, ${formatMiles(p.miles)}` : null, p.months ? `${plural(p.months, "phone month")}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="font-semibold">{formatCents(p.cents)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="text-lg">Download for the financial system</h2>
            <p className="text-sm text-ink-500">
              {batch.exportedAt
                ? `Downloaded ${formatDateTime(batch.exportedAt)}${batch.exportedBy ? ` by ${batch.exportedBy}` : ""}. You can download it again.`
                : "Downloading freezes the batch, so no claims can be added or removed afterwards."}
            </p>
            {batch.claims.length > 0 ? <ExportButtons batchId={batch.id} /> : null}
            <p className="text-xs text-ink-500">
              These are general spreadsheet layouts until we know the financial system&apos;s import format.
            </p>
          </Card>
          <Card className="space-y-4 p-5">
            <h2 className="text-lg">Payment</h2>
            {batch.status === "paid" ? (
              <p>
                Paid on <strong>{formatDay(batch.paidOn!, { withYear: true })}</strong>
                {batch.paidBy ? `, recorded by ${batch.paidBy}` : ""}.
              </p>
            ) : batch.status === "open" ? (
              <p className="text-sm text-ink-500">Download the file first, then come back here once the payment has gone out.</p>
            ) : (
              <MarkPaidForm batchId={batch.id} today={todayIso()} total={formatCents(batch.totalCents)} />
            )}
          </Card>
        </aside>
      </div>
    </Container>
  );
}
