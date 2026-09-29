import { ArrowLeft, PencilLine, Printer, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { TripSummary } from "@/components/trip-summary";
import { ButtonLink, Card, Container, Eyebrow, Notice } from "@/components/ui";
import { hasRole, requireViewer } from "@/lib/auth/viewer";
import { claimDetail, unclaimedTrips } from "@/lib/data/claims";
import { formatDate, formatDay, plural } from "@/lib/format";
import { formatCents, formatMiles } from "@/lib/money";
import { toPickable } from "@/lib/requests/pickable";
import { STATUS_HELP, batchNumber, claimNumber } from "@/lib/requests/status";
import { resubmit, withdraw } from "../actions";
import { ClaimBuilder } from "../claim-builder";
import { ReviewPanel } from "./review-panel";

export const metadata: Metadata = { title: "Claim" };

const DONE: Record<string, string> = {
  submitted: "Claim sent. Your coordinator will review it, and you'll see an update here.",
  resubmitted: "Claim sent again. Your coordinator will take another look.",
  withdrawn: "Claim withdrawn. It's a draft again: change what you need, then resubmit.",
  approved: "Claim approved.",
  returned: "Claim returned to the employee with your comment.",
  denied: "Claim denied.",
};

export default async function ClaimPage({ params, searchParams }: PageProps<"/claims/[id]">) {
  const viewer = await requireViewer();
  const { id } = await params;
  const { done, error } = await searchParams;
  const claim = await claimDetail(viewer, id);
  if (!claim) notFound();

  const miles = claim.trips.reduce((n, t) => n + Number(t.miles), 0);
  const extraTrips = claim.can.resubmit ? await unclaimedTrips(viewer) : [];
  const backHref = claim.isOwner ? "/claims" : claim.can.review ? "/review" : hasRole(viewer, "finance", "admin") ? "/finance" : "/";
  const backLabel = claim.isOwner ? "Claims" : claim.can.review ? "Review" : hasRole(viewer, "finance", "admin") ? "Finance" : "Home";
  const dates = claim.trips.map((t) => t.date).sort();

  return (
    <Container className="py-8">
      <Link href={backHref} className="no-print mb-4 inline-flex min-h-10 items-center gap-1.5 font-display font-medium text-brand-600 hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {backLabel}
      </Link>

      <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>{claim.isOwner ? "Your claim" : `${claim.owner.fullName}'s claim`}</Eyebrow>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-[1.75rem] sm:text-4xl">
            Claim {claimNumber(claim.ref)} <StatusBadge status={claim.status} className="text-sm" />
          </h1>
          {claim.isOwner ? <p className="mt-2 text-ink-500">{STATUS_HELP[claim.status]}</p> : null}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <ButtonLink href={`/print/claims/${claim.id}`} variant="secondary" target="_blank">
            <Printer aria-hidden className="size-4" /> Print
          </ButtonLink>
          {claim.can.withdraw ? (
            <form action={withdraw.bind(null, claim.id)}>
              <ConfirmButton variant="secondary" confirm="Take this claim back? It becomes a draft, and your coordinator won't see it until you resubmit.">
                <Undo2 aria-hidden className="size-4" /> Withdraw
              </ConfirmButton>
            </form>
          ) : null}
        </div>
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
      {claim.lastDecision && (claim.status === "returned" || claim.status === "denied") ? (
        <Notice
          tone={claim.status === "denied" ? "error" : "warning"}
          className="mb-6"
          title={`${claim.status === "denied" ? "Denied" : "Returned"} by ${claim.lastDecision.actorName} on ${formatDate(claim.lastDecision.createdAt)}`}
        >
          “{claim.lastDecision.comment}”
        </Notice>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          <section aria-labelledby="trips">
            <h2 id="trips" className="text-2xl">
              Trips
            </h2>
            {claim.employeeNote ? (
              <p className="mt-2 text-ink-700">
                <span className="font-semibold">Note from {claim.isOwner ? "you" : claim.owner.fullName}:</span> “{claim.employeeNote}”
              </p>
            ) : null}
            <ul className="mt-4 grid gap-3">
              {claim.trips.map((trip) => (
                <li key={trip.id} className="card p-5">
                  <TripSummary trip={trip} showRate />
                  {claim.can.editTrips ? (
                    <div className="mt-3 border-t border-ink-100 pt-3">
                      <Link
                        href={`/trips/${trip.id}/edit`}
                        className="inline-flex min-h-10 items-center gap-1.5 font-display font-medium text-brand-600 hover:underline"
                      >
                        <PencilLine aria-hidden className="size-4" /> Edit
                        <span className="sr-only"> trip on {formatDay(trip.date)}</span>
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {claim.trips.length === 0 ? <p className="mt-3 text-ink-500">This claim has no trips.</p> : null}
          </section>

          {claim.can.review || claim.can.returnApproved ? (
            <ReviewPanel
              requestId={claim.id}
              ownerName={claim.owner.fullName}
              totalCents={claim.totalCents}
              mode={claim.can.review ? "review" : "return-approved"}
              flagged={claim.trips.some((t) => t.involvesHome || t.overrideReason)}
            />
          ) : null}

          {claim.can.resubmit ? (
            <section aria-labelledby="resubmit" className="border-t border-ink-100 pt-8">
              <h2 id="resubmit" className="text-2xl">
                {claim.status === "returned" ? "Fix and resubmit" : "Send it again"}
              </h2>
              <p className="mt-1 mb-4 text-ink-500">
                Edit any trip above first. Then choose the trips to send. You can also add trips you haven&apos;t submitted
                yet.
              </p>
              <ClaimBuilder
                trips={[...claim.trips.map((t) => toPickable(t, true)), ...extraTrips.map((t) => toPickable(t, false))]}
                action={resubmit.bind(null, claim.id)}
                submitLabel="Resubmit claim"
                preselect="in-claim"
              />
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="text-lg">Summary</h2>
            <dl className="mt-3 space-y-2.5 text-[0.95rem]">
              <Row label="Employee" value={claim.owner.fullName} />
              <Row label="Approver" value={claim.owner.coordinatorName ?? "An admin"} />
              <Row
                label="Trips"
                value={`${plural(claim.trips.length, "trip")}${dates.length ? `, ${formatDay(dates[0], { weekday: false })} to ${formatDay(dates[dates.length - 1], { weekday: false })}` : ""}`}
              />
              <Row label="Miles" value={formatMiles(miles)} />
              {claim.submittedAt ? <Row label="Sent" value={formatDate(claim.submittedAt)} /> : null}
              {claim.batch ? (
                <Row
                  label="Payment"
                  value={
                    claim.batch.paidOn
                      ? `Paid ${formatDay(claim.batch.paidOn, { withYear: true, weekday: false })} (batch ${batchNumber(claim.batch.ref)})`
                      : `Batch ${batchNumber(claim.batch.ref)}`
                  }
                />
              ) : null}
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t border-ink-100 pt-4">
              <span className="text-ink-500">Total</span>
              <span className="font-display text-3xl font-semibold text-brand-600">{formatCents(claim.totalCents)}</span>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-lg">History</h2>
            <Timeline events={claim.events} />
          </Card>
        </aside>
      </div>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
