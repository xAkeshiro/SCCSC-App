import { MapPin, PencilLine, Plus, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { TripSummary } from "@/components/trip-summary";
import { ButtonLink, Card, Container, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { myTrips } from "@/lib/data/trips";
import { formatDay, plural } from "@/lib/format";
import { formatCents, formatMiles } from "@/lib/money";
import { claimNumber } from "@/lib/requests/status";

export const metadata: Metadata = { title: "Trips" };

const SAVED = { added: "Trip saved.", updated: "Changes saved.", deleted: "Trip deleted." } as const;

export default async function TripsPage({ searchParams }: PageProps<"/trips">) {
  const viewer = await requireRole("employee");
  const { saved } = await searchParams;
  const { unclaimed, claimed } = await myTrips(viewer);
  const totalCents = unclaimed.reduce((n, t) => n + t.amountCents, 0);
  const totalMiles = unclaimed.reduce((n, t) => n + Number(t.miles), 0);

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Mileage"
        title="Trips"
        description="Log trips as you go. When you're ready, submit them together as a claim."
        actions={
          <>
            <ButtonLink href="/trips/places" variant="secondary">
              <MapPin aria-hidden className="size-4" /> My places
            </ButtonLink>
            <ButtonLink href="/trips/new">
              <Plus aria-hidden className="size-5" /> Log a trip
            </ButtonLink>
          </>
        }
      />

      {typeof saved === "string" && saved in SAVED ? (
        <Notice tone="success" className="mb-6">
          {SAVED[saved as keyof typeof SAVED]}
        </Notice>
      ) : null}

      <section aria-labelledby="unclaimed">
        <h2 id="unclaimed" className="text-2xl">
          Not submitted yet
        </h2>
        {unclaimed.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No trips waiting" action={<ButtonLink href="/trips/new">Log a trip</ButtonLink>}>
              Trips you log show up here until you submit them.
            </EmptyState>
          </div>
        ) : (
          <>
            <ul className="mt-4 grid gap-3">
              {unclaimed.map((trip) => (
                <li key={trip.id} className="card p-5">
                  <TripSummary trip={trip} />
                  <div className="mt-3 border-t border-ink-100 pt-3">
                    <Link
                      href={`/trips/${trip.id}/edit`}
                      className="inline-flex min-h-10 items-center gap-1.5 font-display font-medium text-brand-600 hover:underline"
                    >
                      <PencilLine aria-hidden className="size-4" /> Edit
                      <span className="sr-only"> trip on {formatDay(trip.date)}</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-ink-500">
                  {plural(unclaimed.length, "trip")} · {formatMiles(totalMiles)}
                </p>
                <p className="font-display text-2xl font-semibold text-brand-600">{formatCents(totalCents)}</p>
              </div>
              <ButtonLink href="/claims/new" size="lg">
                <Send aria-hidden className="size-5" /> Submit for approval
              </ButtonLink>
            </Card>
          </>
        )}
      </section>

      {claimed.length > 0 ? (
        <section aria-labelledby="claimed" className="mt-10">
          <h2 id="claimed" className="text-2xl">
            In claims
          </h2>
          <div className="card mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead className="border-b border-ink-100 text-sm text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Trip</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Claim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {claimed.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 whitespace-nowrap">{formatDay(t.date)}</td>
                    <td className="px-5 py-3">
                      <span className="line-clamp-1">{t.purpose}</span>
                      <span className="text-sm text-ink-500">
                        {[t.fromLabel, ...t.stops.map((s) => s.label), t.toLabel].join(" → ")}
                        {t.roundTrip ? " and back" : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">{formatCents(t.amountCents)}</td>
                    <td className="px-5 py-3">
                      <Link href={`/claims/${t.requestId}`} className="flex flex-col gap-1 font-semibold text-brand-600 hover:underline">
                        {claimNumber(t.claimRef)}
                        <StatusBadge status={t.claimStatus} className="w-fit" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </Container>
  );
}
