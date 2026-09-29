import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { savedPlaces } from "@/db/schema";
import { rows, withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";

export async function placesFor(viewer: Viewer) {
  return withUser(viewer.userId, async (tx) => ({
    shared: await tx.select().from(savedPlaces).where(isNull(savedPlaces.ownerId)).orderBy(asc(savedPlaces.label)),
    mine: await tx.select().from(savedPlaces).where(eq(savedPlaces.ownerId, viewer.staffId)).orderBy(asc(savedPlaces.label)),
  }));
}

export async function addPlace(viewer: Viewer, input: { label: string; address: string; isHome: boolean }) {
  return withUser(viewer.userId, async (tx) => {
    const [dupe] = await tx
      .select({ id: savedPlaces.id })
      .from(savedPlaces)
      .where(and(eq(savedPlaces.ownerId, viewer.staffId), sql`lower(${savedPlaces.label}) = lower(${input.label})`))
      .limit(1);
    if (dupe) throw new UserError(`You already have a place called “${input.label}”.`);
    await tx.insert(savedPlaces).values({ ownerId: viewer.staffId, label: input.label, address: input.address, isHome: input.isHome });
  });
}

export async function removePlace(viewer: Viewer, placeId: string) {
  if (!z.string().uuid().safeParse(placeId).success) throw new UserError("Place not found.");
  return withUser(viewer.userId, async (tx) => {
    // Trips in sent claims keep their record of the place; removing it would change them.
    const [used] = await rows<{ n: number }>(
      tx,
      sql`select count(*)::int as n
          from public.mileage_details d
          join public.request_items i on i.id = d.item_id
          join public.requests r on r.id = i.request_id
          where (d.from_place_id = ${placeId}::uuid or d.to_place_id = ${placeId}::uuid)
            and r.status not in ('draft', 'returned')`,
    );
    if (used.n > 0) throw new UserError("This place is used by trips in claims you've already sent, so it can't be removed.");
    const [deleted] = await tx
      .delete(savedPlaces)
      .where(and(eq(savedPlaces.id, placeId), eq(savedPlaces.ownerId, viewer.staffId)))
      .returning({ id: savedPlaces.id });
    if (!deleted) throw new UserError("Place not found.");
  });
}
