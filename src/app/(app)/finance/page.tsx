import { BarChart3, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BatchStatusBadge } from "@/components/batch-status";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { financeOverview } from "@/lib/data/finance";
import { formatDay, plural, todayIso } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { batchNumber } from "@/lib/requests/status";
import { BatchBuilder } from "./batch-builder";

export const metadata: Metadata = { title: "Finance" };

export default async function FinancePage() {
  const viewer = await requireRole("finance", "admin");
  const { approved, batches } = await financeOverview(viewer);
  const readyTotal = approved.reduce((n, c) => n + c.totalCents, 0);
  const today = todayIso();
  const firstDates = approved.map((c) => c.firstDate).filter((d): d is string => Boolean(d)).sort();
  const openBatches = batches.filter((b) => b.status === "open");

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Finance"
        title="Pay approved claims"
        description="Put approved claims in a batch for a pay period, download the file for the financial system, then mark the batch paid."
        actions={
          <ButtonLink href="/finance/reports" variant="secondary">
            <BarChart3 aria-hidden className="size-4" /> Reports
          </ButtonLink>
        }
      />

      <section aria-labelledby="ready">
        <h2 id="ready" className="text-2xl">
          Ready to pay{" "}
          {approved.length ? (
            <span className="text-ink-500">
              ({plural(approved.length, "claim")}, {formatCents(readyTotal)})
            </span>
          ) : null}
        </h2>
        <div className="mt-4">
          {approved.length === 0 ? (
            <EmptyState title="Nothing waiting">Claims show up here once a coordinator approves them.</EmptyState>
          ) : (
            <BatchBuilder
              claims={approved.map((c) => ({
                id: c.id,
                ref: c.ref,
                ownerName: c.ownerName,
                totalCents: c.totalCents,
                tripCount: c.tripCount,
                firstDate: c.firstDate,
                lastDate: c.lastDate,
                approvedBy: c.approvedBy,
              }))}
              openBatches={openBatches.map((b) => ({ id: b.id, ref: b.ref, periodStart: b.periodStart, periodEnd: b.periodEnd }))}
              defaultStart={firstDates[0] ?? today}
              defaultEnd={today}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="batches" className="mt-12">
        <h2 id="batches" className="text-2xl">
          Batches
        </h2>
        {batches.length === 0 ? (
          <p className="mt-3 text-ink-500">No batches yet.</p>
        ) : (
          <ul className="card mt-4 divide-y divide-ink-100">
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`/finance/batches/${b.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-surface">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-semibold">Batch {batchNumber(b.ref)}</span>
                      <BatchStatusBadge status={b.status} />
                    </p>
                    <p className="text-sm text-ink-500">
                      Pay period {formatDay(b.periodStart, { weekday: false })} to {formatDay(b.periodEnd, { weekday: false, withYear: true })} ·{" "}
                      {plural(b.claimCount, "claim")}
                      {b.paidOn ? ` · paid ${formatDay(b.paidOn, { weekday: false, withYear: true })}` : ""}
                    </p>
                  </div>
                  <p className="font-display text-xl font-semibold">{formatCents(b.totalCents)}</p>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-500" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
