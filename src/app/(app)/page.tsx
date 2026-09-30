import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  ListChecks,
  Plus,
  RotateCcw,
  Send,
  Smartphone,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { BrushText, ButtonLink, Card, Container, Eyebrow, Stat } from "@/components/ui";
import { hasRole, requireViewer } from "@/lib/auth/viewer";
import { homeSummary, markUpdatesSeen } from "@/lib/data/home";
import { phoneBillDue } from "@/lib/data/phone";
import { formatDay, plural, timeAgo } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { firstName } from "@/lib/names";
import { claimNumber } from "@/lib/requests/status";

export const metadata: Metadata = { title: "Home" };

const UPDATE_ICON = {
  approved: { Icon: CheckCircle2, className: "text-status-approved", text: "approved" },
  returned: { Icon: RotateCcw, className: "text-status-returned", text: "returned" },
  denied: { Icon: XCircle, className: "text-status-denied", text: "denied" },
  paid: { Icon: CircleDollarSign, className: "text-status-approved", text: "marked as paid" },
} as const;

export default async function HomePage() {
  const viewer = await requireViewer();
  const s = await homeSummary(viewer);
  const logsTrips = hasRole(viewer, "employee");
  const phone = logsTrips ? await phoneBillDue(viewer) : null;
  const newUpdates = s.updates.filter((u) => u.isNew).length;

  async function markRead() {
    "use server";
    const v = await requireViewer();
    await markUpdatesSeen(v);
    revalidatePath("/");
  }

  return (
    <>
      <section className="border-b border-ink-100 bg-white">
        <Container className="py-8 sm:py-10">
          <Eyebrow>Welcome back</Eyebrow>
          <h1 className="mt-2 text-4xl sm:text-5xl">
            Hi, <BrushText>{firstName(viewer.fullName)}</BrushText>
          </h1>
          {logsTrips ? (
            <>
              <p className="mt-3 max-w-xl text-lg text-ink-500">
                {s.unclaimed.count > 0
                  ? `You have ${plural(s.unclaimed.count, "trip")} (${formatCents(s.unclaimed.cents)}) that ${s.unclaimed.count === 1 ? "hasn't" : "haven't"} been submitted yet.`
                  : "Log a trip right after you drive, then submit your trips when you're ready."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href="/trips/new" size="lg">
                  <Plus aria-hidden className="size-5" /> Log a trip
                </ButtonLink>
                {s.unclaimed.count > 0 ? (
                  <ButtonLink href="/claims/new" size="lg" variant="secondary">
                    <Send aria-hidden className="size-5" /> Submit {plural(s.unclaimed.count, "trip")}
                  </ButtonLink>
                ) : null}
              </div>
            </>
          ) : null}
        </Container>
      </section>

      <Container className="space-y-8 py-8">
        {s.needsAction.length > 0 ? (
          <section aria-labelledby="attention">
            <h2 id="attention" className="text-2xl">
              Needs your attention
            </h2>
            <ul className="mt-4 grid gap-3">
              {s.needsAction.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/claims/${c.id}`}
                    className="card flex flex-col gap-3 border-l-4 border-l-status-returned p-5 hover:shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-semibold">Claim {claimNumber(c.ref, c.type)}</span>
                        <StatusBadge status={c.status} />
                        <span className="text-ink-500">{formatCents(c.totalCents)}</span>
                      </div>
                      {c.comment ? (
                        <p className="mt-1.5 text-ink-700">
                          <span className="font-semibold">{c.by}:</span> “{c.comment}”
                        </p>
                      ) : (
                        <p className="mt-1.5 text-ink-700">This claim hasn&apos;t been sent yet.</p>
                      )}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 font-display font-medium text-brand-600">
                      {c.status === "returned" ? "Fix and resubmit" : "Open"} <ArrowRight aria-hidden className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {phone?.available ? (
          <section aria-labelledby="phone-bill">
            <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                  <Smartphone aria-hidden className="size-6" />
                </span>
                <div>
                  <h2 id="phone-bill" className="text-xl">
                    Phone bill
                  </h2>
                  {phone.unclaimed.length > 0 ? (
                    <p className="mt-0.5 text-ink-700">
                      {phone.period.label} is ready to claim:{" "}
                      <strong className="font-display text-brand-600">{formatCents(phone.cents)}</strong>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-ink-700">
                      You&apos;ve claimed {phone.period.label}. The next claim opens{" "}
                      {formatDay(phone.next.opens, { weekday: false, withYear: false })} for {phone.next.label}.
                    </p>
                  )}
                </div>
              </div>
              <ButtonLink href="/phone" variant={phone.unclaimed.length > 0 ? "primary" : "secondary"} className="shrink-0">
                {phone.unclaimed.length > 0 ? `Claim ${formatCents(phone.cents)}` : "See phone bills"}
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            </div>
          </section>
        ) : null}

        {s.toReview || s.toBatch || s.accessRequests || hasRole(viewer, "coordinator", "finance", "admin") ? (
          <section aria-label="Your queues" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hasRole(viewer, "coordinator", "admin") ? (
              <QueueCard
                href="/review"
                icon={<ListChecks aria-hidden className="size-6" />}
                count={s.toReview}
                label={s.toReview === 1 ? "claim waiting for your review" : "claims waiting for your review"}
              />
            ) : null}
            {hasRole(viewer, "finance", "admin") ? (
              <QueueCard
                href="/finance"
                icon={<Banknote aria-hidden className="size-6" />}
                count={s.toBatch}
                label={s.toBatch === 1 ? "approved claim ready to pay" : "approved claims ready to pay"}
              />
            ) : null}
            {hasRole(viewer, "admin") ? (
              <QueueCard
                href="/admin"
                icon={<UserPlus aria-hidden className="size-6" />}
                count={s.accessRequests}
                label={s.accessRequests === 1 ? "person waiting for access" : "people waiting for access"}
              />
            ) : null}
          </section>
        ) : null}

        {logsTrips ? (
          <section aria-labelledby="money">
            <h2 id="money" className="sr-only">
              Your reimbursements at a glance
            </h2>
            <Card className="grid grid-cols-2 gap-x-6 gap-y-6 p-6 sm:p-8 lg:grid-cols-4">
              <Stat value={formatCents(s.unclaimed.cents)} label="Not submitted yet" hint={plural(s.unclaimed.count, "trip")} />
              <Stat value={formatCents(s.waiting.cents)} label="Waiting for approval" hint={plural(s.waiting.count, "claim")} />
              <Stat value={formatCents(s.approved.cents)} label="Approved, not paid yet" hint={plural(s.approved.count, "claim")} />
              <Stat
                value={formatCents(s.paidThisYear.cents)}
                label={`Paid in ${new Date().getFullYear()}`}
                hint={plural(s.paidThisYear.count, "claim")}
              />
            </Card>
          </section>
        ) : null}

        {logsTrips ? (
          <section aria-labelledby="updates">
            <div className="flex items-end justify-between gap-3">
              <h2 id="updates" className="text-2xl">
                Updates {newUpdates > 0 ? <span className="align-middle text-base text-brand-600">({newUpdates} new)</span> : null}
              </h2>
              {newUpdates > 0 ? (
                <form action={markRead}>
                  <button type="submit" className="min-h-10 font-display text-sm font-medium text-brand-600 hover:underline">
                    Mark all as read
                  </button>
                </form>
              ) : null}
            </div>
            {s.updates.length === 0 ? (
              <p className="mt-3 text-ink-500">When your claims are approved, returned or paid, you&apos;ll see it here.</p>
            ) : (
              <ul className="card mt-4 divide-y divide-ink-100">
                {s.updates.map((u) => {
                  const meta = UPDATE_ICON[u.action as keyof typeof UPDATE_ICON];
                  if (!meta) return null;
                  return (
                    <li key={u.id}>
                      <Link href={`/claims/${u.requestId}`} className="flex gap-3 px-5 py-4 hover:bg-surface">
                        <meta.Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${meta.className}`} />
                        <div className="min-w-0 flex-1">
                          <p>
                            <span className="font-semibold">Claim {claimNumber(u.ref, u.type)}</span> was {meta.text} by {u.actorName}
                            {u.isNew ? (
                              <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">New</span>
                            ) : null}
                          </p>
                          {u.comment && u.action !== "paid" ? <p className="mt-0.5 text-ink-500">“{u.comment}”</p> : null}
                          <p className="mt-0.5 text-sm text-ink-500">{timeAgo(u.createdAt)}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </Container>
    </>
  );
}

function QueueCard({ href, icon, count, label }: { href: string; icon: React.ReactNode; count: number; label: string }) {
  return (
    <Link href={href} className="card group flex items-center gap-4 p-5 hover:shadow-[var(--shadow-card)]">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-3xl font-semibold text-brand-600">{count}</span>
        <span className="block text-ink-700">{label}</span>
      </span>
      <ArrowRight aria-hidden className="size-5 text-brand-600 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
