import { CalendarClock, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Container, Notice, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { myClaims } from "@/lib/data/claims";
import { phoneOverview } from "@/lib/data/phone";
import { formatDate, formatDay } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { STATUS_LABEL, claimNumber } from "@/lib/requests/status";
import { itemsSummary } from "@/lib/requests/types";
import { claimPhone } from "./actions";
import { PhoneMonthPicker, type PickableMonth } from "./month-picker";

export const metadata: Metadata = { title: "Phone bill" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "February, April, June, August, October and December" for 2 months per claim. */
function claimMonths(monthsPerClaim: number) {
  const names = MONTH_NAMES.filter((_, i) => (i + 1) % monthsPerClaim === 0);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const EVERY: Record<number, string> = { 1: "every month", 2: "every two months", 3: "every three months", 4: "every four months", 6: "twice a year", 12: "once a year" };

export default async function PhoneBillPage() {
  const viewer = await requireRole("employee");
  const o = await phoneOverview(viewer);
  const claims = (await myClaims(viewer)).filter((c) => c.type === "phone");

  const groups = o.periods.map((p, i) => ({
    title: i === 0 ? p.period.label : `Missed an earlier period? ${p.period.label}`,
    months: p.months.map<PickableMonth>((m) => ({
      value: m.month,
      month: m.month,
      amountCents: m.amountCents,
      unavailable: m.claim
        ? `In claim ${claimNumber(m.claim.ref, "phone")}: ${STATUS_LABEL[m.claim.status].toLowerCase()}`
        : m.amountCents === null
          ? "No amount set for this month"
          : undefined,
      checked: i === 0,
    })),
  }));
  const anyToClaim = groups.some((g) => g.months.some((m) => !m.unavailable));
  const latestDone = o.periods[0].months.every((m) => m.claim);

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Reimbursements"
        title="Phone bill"
        description={
          o.rateCents
            ? `${formatCents(Math.round(Number(o.rateCents)))} a month for using your own phone for work. Claim it ${EVERY[o.monthsPerClaim] ?? `every ${o.monthsPerClaim} months`}, in ${claimMonths(o.monthsPerClaim)}.`
            : "A monthly amount for using your own phone for work."
        }
      />

      {!o.rateCents ? (
        <Notice tone="warning" title="Not set up yet">
          The phone bill amount hasn&apos;t been set. Please ask an admin.
        </Notice>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="claim">
            <h2 id="claim" className="text-2xl">
              {latestDone ? "You're up to date" : "Claim your phone bill"}
            </h2>
            <p className="mt-1 mb-4 text-ink-500">
              {latestDone
                ? `You've claimed ${o.periods[0].period.label}.`
                : "Add a photo or PDF of your bill. Untick any month you didn't use your phone for work (for example, before you started)."}
            </p>
            {anyToClaim ? (
              <PhoneMonthPicker
                groups={groups}
                field="month"
                action={claimPhone}
                submitLabel="Claim phone bill"
                programs={o.programs}
                defaultProgramId={o.defaultProgramId}
              />
            ) : null}
          </section>

          <aside className="space-y-6">
            <div className="card flex gap-3 p-5">
              <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
              <p>
                <span className="font-semibold">Next claim:</span> {o.next.label}, from{" "}
                {formatDay(o.next.opens, { withYear: true })}.
              </p>
            </div>
            <section aria-labelledby="past" className="card p-5">
              <h2 id="past" className="text-lg">
                Your phone bill claims
              </h2>
              {claims.length === 0 ? (
                <p className="mt-2 text-ink-500">None yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-ink-100">
                  {claims.map((c) => (
                    <li key={c.id}>
                      <Link href={`/claims/${c.id}`} className="flex items-center gap-3 py-3 hover:text-brand-600">
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-display font-semibold">{claimNumber(c.ref, c.type)}</span>
                            <StatusBadge status={c.status} />
                          </span>
                          <span className="mt-0.5 block text-sm text-ink-500">
                            {itemsSummary(c.type, c.tripCount, c.firstDate, c.lastDate)}
                            {c.submittedAt ? ` · sent ${formatDate(c.submittedAt)}` : ""}
                          </span>
                        </span>
                        <span className="font-display font-semibold">{formatCents(c.totalCents)}</span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-500" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
