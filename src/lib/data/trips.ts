import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { programs, requests, tripView } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import type { RequestStatus } from "@/lib/requests/status";

export type TripRecord = {
  id: string;
  ownerId: string;
  requestId: string | null;
  date: string;
  purpose: string;
  notes: string | null;
  programId: string | null;
  programCode: string | null;
  programName: string | null;
  amountCents: number;
  fromLabel: string;
  fromAddress: string | null;
  fromIsHome: boolean;
  fromPlaceId: string | null;
  toLabel: string;
  toAddress: string | null;
  toIsHome: boolean;
  toPlaceId: string | null;
  stops: { label: string; address: string | null; placeId: string | null; isHome: boolean }[];
  roundTrip: boolean;
  miles: string;
  milesEstimated: string | null;
  overrideReason: string | null;
  rateCents: string;
  involvesHome: boolean;
};

const tripColumns = {
  id: tripView.id,
  ownerId: tripView.ownerId,
  requestId: tripView.requestId,
  date: tripView.itemDate,
  purpose: tripView.purpose,
  notes: tripView.notes,
  programId: tripView.programId,
  programCode: programs.code,
  programName: programs.name,
  amountCents: tripView.amountCents,
  fromLabel: tripView.fromLabel,
  fromAddress: tripView.fromAddress,
  fromIsHome: tripView.fromIsHome,
  fromPlaceId: tripView.fromPlaceId,
  toLabel: tripView.toLabel,
  toAddress: tripView.toAddress,
  toIsHome: tripView.toIsHome,
  toPlaceId: tripView.toPlaceId,
  stops: tripView.stops,
  roundTrip: tripView.roundTrip,
  miles: tripView.miles,
  milesEstimated: tripView.milesEstimated,
  overrideReason: tripView.overrideReason,
  rateCents: tripView.rateCents,
  involvesHome: tripView.involvesHome,
};

/** Trips as the viewer may see them (home addresses hidden unless they're the owner). */
export function selectTrips(tx: Tx) {
  return tx.select(tripColumns).from(tripView).leftJoin(programs, eq(programs.id, tripView.programId));
}

export async function tripsForRequests(tx: Tx, requestIds: string[]): Promise<TripRecord[]> {
  if (requestIds.length === 0) return [];
  return selectTrips(tx)
    .where(inArray(tripView.requestId, requestIds))
    .orderBy(tripView.itemDate, tripView.createdAt);
}

export async function myTrips(viewer: Viewer) {
  return withUser(viewer.userId, async (tx) => {
    const unclaimed = await selectTrips(tx)
      .where(and(eq(tripView.ownerId, viewer.staffId), isNull(tripView.requestId)))
      .orderBy(desc(tripView.itemDate), desc(tripView.createdAt));
    const claimed = await tx
      .select({ ...tripColumns, claimRef: requests.ref, claimStatus: requests.status })
      .from(tripView)
      .leftJoin(programs, eq(programs.id, tripView.programId))
      .innerJoin(requests, eq(requests.id, tripView.requestId))
      .where(and(eq(tripView.ownerId, viewer.staffId), isNotNull(tripView.requestId)))
      .orderBy(desc(tripView.itemDate), desc(tripView.createdAt))
      .limit(40);
    return { unclaimed, claimed: claimed as (TripRecord & { claimRef: number; claimStatus: RequestStatus })[] };
  });
}

/** One of the viewer's own trips, with whether it can still be changed. */
export async function myTrip(viewer: Viewer, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  return withUser(viewer.userId, async (tx) => {
    const [trip] = await selectTrips(tx)
      .where(and(eq(tripView.id, id), eq(tripView.ownerId, viewer.staffId)))
      .limit(1);
    if (!trip) return null;
    let claim: { id: string; ref: number; status: RequestStatus } | null = null;
    if (trip.requestId) {
      const [r] = await tx.select({ id: requests.id, ref: requests.ref, status: requests.status }).from(requests).where(eq(requests.id, trip.requestId));
      claim = r ?? null;
    }
    const editable = !claim || claim.status === "draft" || claim.status === "returned";
    return { trip: trip as TripRecord, claim, editable };
  });
}
