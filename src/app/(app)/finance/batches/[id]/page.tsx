import { AlertTriangle, ArrowLeft, Check, Printer, X } from "lucide-react";
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
  created: "Batch created. Next, check the payments and download the file for Aplos.",
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
  const problems = batch.payments.reduce((n, p) => n + p.lines.filter((l) => l.problems.length).length, 0);
  const aplos = (map: Map<string, string>, key: string | null) => (key ? (map.get(key) ?? key) : "—");
  const KIND = { mileage: "Mileage", parking: "Parking", phone: "Phone" } as const;
  const steps = [
    { label: "Check the claims", done: true },
    { label: "Download for Aplos", done: batch.status !== "open" },
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

          <section aria-labelledby="aplos">
            <h2 id="aplos" className="text-2xl">
              Payments for Aplos
            </h2>
            <p className="mt-1 text-ink-500">
              One payment per person, split by budget code, the way you enter it in the Aplos register. The memo lists each claim&apos;s
              label: MIL and the date of the last trip, CELL and the last day of the phone bill period.
            </p>
            {problems ? (
              <Notice tone="warning" title={`${plural(problems, "line needs", "lines need")} a look`} className="mt-4">
                They&apos;re marked below. Fix the account in Admin, Budget codes, or correct the line in Aplos after the import.
              </Notice>
            ) : null}
            <div className="mt-4 space-y-4">
              {batch.payments.map((p) => (
                <article key={p.ownerId} className="card overflow-hidden" aria-label={`Payment to ${p.payee}`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-ink-100 px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="text-lg">{p.payee}</h3>
                      <p className="text-sm text-ink-500">
                        Memo <span className="font-semibold text-ink tabular-nums">{p.memo}</span>
                      </p>
                    </div>
                    <p className="font-display text-xl font-semibold text-brand-600">{formatCents(p.totalCents)}</p>
                  </div>
                  {/* Phones: each split stacked. Wider screens: a table like the Aplos screen. */}
                  <ul className="divide-y divide-ink-100 text-sm sm:hidden">
                    {p.lines.map((l) => (
                      <li key={`${l.label}|${l.kind}|${l.budgetCode}`} className={cx("px-5 py-3", l.problems.length > 0 && "bg-status-returned-bg")}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-display font-semibold whitespace-nowrap tabular-nums">{l.budgetCode}</span>
                          <span className="font-semibold">{formatCents(l.cents)}</span>
                        </div>
                        <p className="text-ink-500">
                          {KIND[l.kind]} · {l.label}
                        </p>
                        <LineProblems problems={l.problems} />
                        <dl className="mt-1 grid grid-cols-[4.5rem_1fr] gap-x-2 text-ink-700">
                          <dt className="text-ink-500">Account</dt>
                          <dd>{aplos(batch.aplosNames.accounts, l.account)}</dd>
                          <dt className="text-ink-500">Fund</dt>
                          <dd>{aplos(batch.aplosNames.funds, l.fund)}</dd>
                          <dt className="text-ink-500">School</dt>
                          <dd>{aplos(batch.aplosNames.sites, l.site)}</dd>
                        </dl>
                      </li>
                    ))}
                  </ul>
                  <table className="hidden w-full text-left text-sm sm:table">
                    <thead className="text-ink-500">
                      <tr>
                        <th scope="col" className="px-5 py-2 font-semibold">Budget code</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Account</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Fund</th>
                        <th scope="col" className="px-3 py-2 font-semibold">School tag</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Comment</th>
                        <th scope="col" className="px-5 py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 border-t border-ink-100">
                      {p.lines.map((l) => (
                        <tr key={`${l.label}|${l.kind}|${l.budgetCode}`} className={l.problems.length ? "bg-status-returned-bg" : undefined}>
                          <td className="px-5 py-2.5 align-top">
                            <span className="font-display font-semibold whitespace-nowrap tabular-nums">{l.budgetCode}</span>
                            <span className="block text-ink-500">{KIND[l.kind]}</span>
                            <LineProblems problems={l.problems} />
                          </td>
                          <td className="px-3 py-2.5 align-top">{aplos(batch.aplosNames.accounts, l.account)}</td>
                          <td className="px-3 py-2.5 align-top">{aplos(batch.aplosNames.funds, l.fund)}</td>
                          <td className="px-3 py-2.5 align-top">{aplos(batch.aplosNames.sites, l.site)}</td>
                          <td className="px-3 py-2.5 align-top whitespace-nowrap tabular-nums">{l.label}</td>
                          <td className="px-5 py-2.5 text-right align-top font-semibold whitespace-nowrap">{formatCents(l.cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="sites">
            <h2 id="sites" className="text-2xl">
              By school or site
            </h2>
            <ul className="card mt-4 divide-y divide-ink-100">
              {batch.bySite.map((p) => (
                <li key={p.code} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span>
                    <span className="font-semibold">{p.name}</span> <span className="text-ink-500">{p.code}</span>
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
            <h2 className="text-lg">Download for Aplos</h2>
            <p className="text-sm text-ink-500">
              {batch.exportedAt
                ? `Downloaded ${formatDateTime(batch.exportedAt)}${batch.exportedBy ? ` by ${batch.exportedBy}` : ""}. You can download it again.`
                : "Downloading freezes the batch, so no claims can be added or removed afterwards."}
            </p>
            {batch.claims.length > 0 ? <ExportButtons batchId={batch.id} defaultDate={batch.paidOn ?? todayIso()} problems={problems} /> : null}
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

function LineProblems({ problems }: { problems: string[] }) {
  return problems.map((x) => (
    <span key={x} className="mt-1 flex items-center gap-1 font-semibold text-status-returned">
      <AlertTriangle aria-hidden className="size-3.5 shrink-0" /> {x}
    </span>
  ));
}
