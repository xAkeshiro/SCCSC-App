import type { TripRecord } from "@/lib/data/trips";

/** A trip as the claim checklist shows it. */
export type PickableTrip = {
  id: string;
  date: string;
  route: string;
  purpose: string;
  amountCents: number;
  miles: string;
  flagged: boolean;
  inClaim: boolean;
};

export function routeText(t: Pick<TripRecord, "fromLabel" | "stops" | "toLabel" | "roundTrip">) {
  return [t.fromLabel, ...t.stops.map((s) => s.label), t.toLabel].join(" → ") + (t.roundTrip ? " and back" : "");
}

export function toPickable(t: TripRecord, inClaim = false): PickableTrip {
  return {
    id: t.id,
    date: t.date,
    route: routeText(t),
    purpose: t.purpose,
    amountCents: t.amountCents,
    miles: t.miles,
    flagged: t.involvesHome || Boolean(t.overrideReason),
    inClaim,
  };
}
