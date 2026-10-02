import { ArrowRight, Home, PencilLine, Repeat } from "lucide-react";
import type { TripRecord } from "@/lib/data/trips";
import { formatDay } from "@/lib/format";
import { formatCents, formatMiles, formatRate } from "@/lib/money";
import { Chip } from "./ui";

/** The route as words: "Main office → Harbor Point High → Willow Creek Middle". */
export function RouteText({ trip }: { trip: Pick<TripRecord, "fromLabel" | "toLabel" | "stops" | "roundTrip"> }) {
  const points = [trip.fromLabel, ...trip.stops.map((s) => s.label), trip.toLabel];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {points.map((label, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 ? <ArrowRight aria-label="to" className="size-4 shrink-0 text-ink-500" /> : null}
          <span>{label}</span>
        </span>
      ))}
      {trip.roundTrip ? (
        <span className="inline-flex items-center gap-1 text-ink-500">
          <Repeat aria-hidden className="size-4" /> and back
        </span>
      ) : null}
    </span>
  );
}

/** Flags a reviewer should notice. */
export function TripFlags({ trip }: { trip: Pick<TripRecord, "involvesHome" | "overrideReason" | "milesEstimated" | "miles"> }) {
  if (!trip.involvesHome && !trip.overrideReason) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {trip.involvesHome ? (
        <Chip className="bg-status-returned-bg text-status-returned" title="The trip starts, stops or ends at a place saved as Home">
          <Home aria-hidden className="size-3.5" /> Starts or ends at home
        </Chip>
      ) : null}
      {trip.overrideReason ? (
        <Chip className="bg-status-submitted-bg text-status-submitted" title={trip.overrideReason}>
          <PencilLine aria-hidden className="size-3.5" /> Miles changed from {trip.milesEstimated}
        </Chip>
      ) : null}
    </div>
  );
}

/** One trip as a compact block: date, route, purpose, miles and amount. */
export function TripSummary({ trip, showRate = false }: { trip: TripRecord; showRate?: boolean }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-500">{formatDay(trip.date)}</p>
        <p className="mt-0.5 font-display text-lg leading-snug font-medium">
          <RouteText trip={trip} />
        </p>
        <p className="mt-1 text-ink-700">{trip.purpose}</p>
        {trip.notes ? <p className="mt-0.5 text-sm text-ink-500">Note: {trip.notes}</p> : null}
        {trip.overrideReason ? <p className="mt-0.5 text-sm text-ink-500">Why the miles changed: {trip.overrideReason}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {trip.costType ? <Chip>{trip.costType === "direct" ? "Direct" : "Indirect"}</Chip> : null}
          {trip.siteCode ? <Chip title={trip.siteName ?? undefined}>{trip.siteName ?? trip.siteCode}</Chip> : null}
          {trip.parkingCents > 0 ? <Chip>Parking {formatCents(trip.parkingCents)}</Chip> : null}
        </div>
        <TripFlags trip={trip} />
      </div>
      <div className="flex shrink-0 items-baseline gap-3 sm:flex-col sm:items-end sm:gap-0.5">
        <p className="font-display text-xl font-semibold">{formatCents(trip.amountCents)}</p>
        <p className="text-sm text-ink-500">
          {formatMiles(trip.miles)}
          {showRate ? ` at ${formatRate(trip.rateCents)}` : ""}
        </p>
      </div>
    </div>
  );
}
