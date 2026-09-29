/**
 * The mileage request type: what a trip needs, how miles and money are worked out, and saving.
 * Everything runs as the signed-in user (RLS applies); the database also re-checks locks.
 */
import "server-only";

import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { mileageDetails, programs, rates, requestItems, savedPlaces, type Stop } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { getDistanceProvider } from "@/lib/distance";
import { UserError } from "@/lib/errors";
import { todayIso } from "@/lib/format";
import { mileageAmountCents, normalizeMiles } from "@/lib/money";
import { readSettings } from "@/lib/settings";

export const REQUEST_TYPE = "mileage";
/** Oldest trip date accepted, in days. Older trips need a conversation with finance. */
export const MAX_TRIP_AGE_DAYS = 365;
export const MAX_STOPS = 8;

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

/** A point on the route: a saved place, or an address typed in. */
export type PointInput = { placeId: string | null; address: string };

export type TripInput = {
  date: string;
  from: PointInput;
  stops: PointInput[];
  to: PointInput;
  roundTrip: boolean;
  miles: string;
  overrideReason: string;
  purpose: string;
  programId: string | null;
  notes: string;
};

export type TripErrors = Partial<Record<"date" | "from" | "to" | "stops" | "miles" | "overrideReason" | "purpose" | "programId" | "form", string>>;

const str = (v: FormDataEntryValue | null | undefined, max = 500) => (typeof v === "string" ? v.slice(0, max).trim() : "");

function point(place: string, address: string): PointInput {
  return place && place !== "other" ? { placeId: place, address: "" } : { placeId: null, address };
}

/** Reads the trip form. Stops come as repeated stop_place / stop_address fields, in order. */
export function parseTripForm(formData: FormData): TripInput {
  const stopPlaces = formData.getAll("stop_place").map((v) => str(v, 64));
  const stopAddresses = formData.getAll("stop_address").map((v) => str(v, 300));
  return {
    date: str(formData.get("date"), 10),
    from: point(str(formData.get("from_place"), 64), str(formData.get("from_address"), 300)),
    stops: stopPlaces
      .map((p, i) => point(p, stopAddresses[i] ?? ""))
      .filter((s) => s.placeId || s.address)
      .slice(0, MAX_STOPS),
    to: point(str(formData.get("to_place"), 64), str(formData.get("to_address"), 300)),
    roundTrip: formData.get("round_trip") === "on",
    miles: str(formData.get("miles"), 12),
    overrideReason: str(formData.get("override_reason"), 500),
    purpose: str(formData.get("purpose"), 300),
    programId: str(formData.get("program_id"), 64) || null,
    notes: str(formData.get("notes"), 1000),
  };
}

const uuid = z.string().uuid();

// ---------------------------------------------------------------------------------------------
// Working out a trip
// ---------------------------------------------------------------------------------------------

type ResolvedPoint = { placeId: string | null; label: string; address: string | null; lat: number | null; lng: number | null; isHome: boolean };

async function resolvePoint(tx: Tx, p: PointInput): Promise<ResolvedPoint | null> {
  if (p.placeId) {
    if (!uuid.safeParse(p.placeId).success) return null;
    // RLS: shared places and the person's own places only.
    const [place] = await tx.select().from(savedPlaces).where(eq(savedPlaces.id, p.placeId)).limit(1);
    if (!place) return null;
    return { placeId: place.id, label: place.label, address: place.address, lat: place.lat, lng: place.lng, isHome: place.isHome };
  }
  const address = p.address.trim();
  if (address.length < 3) return null;
  return { placeId: null, label: address, address, lat: null, lng: null, isHome: false };
}

export async function rateOn(tx: Tx, date: string) {
  const [rate] = await tx
    .select()
    .from(rates)
    .where(and(eq(rates.requestType, REQUEST_TYPE), lte(rates.effectiveFrom, date)))
    .orderBy(desc(rates.effectiveFrom))
    .limit(1);
  return rate ?? null;
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export type WorkedTrip = {
  itemDate: string;
  purpose: string;
  programId: string | null;
  notes: string | null;
  amountCents: number;
  details: Omit<typeof mileageDetails.$inferInsert, "itemId">;
};

/** Validates a trip and works out its miles, rate and amount. Returns field errors if any. */
export async function workOutTrip(tx: Tx, input: TripInput): Promise<{ trip: WorkedTrip } | { errors: TripErrors }> {
  const errors: TripErrors = {};
  const settings = await readSettings(tx);
  const today = todayIso();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) errors.date = "Enter the date you drove.";
  else if (input.date > today) errors.date = "The date can't be in the future.";
  else if (daysBetween(input.date, today) > MAX_TRIP_AGE_DAYS) errors.date = "This trip is more than a year old. Please talk to finance.";

  const from = await resolvePoint(tx, input.from);
  if (!from) errors.from = "Choose where you started, or type the address.";
  const to = await resolvePoint(tx, input.to);
  if (!to) errors.to = "Choose where you went, or type the address.";
  const stops: ResolvedPoint[] = [];
  for (const s of input.stops) {
    const r = await resolvePoint(tx, s);
    if (!r) errors.stops = "One of the stops is missing an address.";
    else stops.push(r);
  }

  if (input.purpose.length < 3) errors.purpose = "Say what the trip was for, like “Parent workshop at Cedar Grove”.";

  if (input.programId) {
    const [program] = uuid.safeParse(input.programId).success
      ? await tx.select().from(programs).where(and(eq(programs.id, input.programId), eq(programs.active, true))).limit(1)
      : [];
    if (!program) errors.programId = "Choose a program from the list.";
  } else if (settings.requireProgram) {
    errors.programId = "Choose the program or grant this trip is for.";
  }

  const route = from && to ? [from, ...stops, to] : null;
  const involvesHome = Boolean(route?.some((p) => p.isHome));
  if (involvesHome && settings.homeTripRule === "block") {
    errors.form = "Trips that start or end at home can't be logged. Please start from your usual workplace, or talk to your coordinator.";
  }

  const estimate = route && !errors.stops ? await getDistanceProvider().estimate(route, input.roundTrip) : null;
  const estimated = estimate === null ? null : normalizeMiles(estimate);
  const miles = normalizeMiles(input.miles || (estimated ?? ""));
  if (!miles || Number(miles) <= 0) errors.miles = estimated ? "Miles must be more than 0." : "Enter the miles you drove.";
  else if (Number(miles) > 1000) errors.miles = "That's a lot of miles for one trip. Please check the number.";
  const overridden = Boolean(estimated && miles && miles !== estimated);
  if (overridden && input.overrideReason.length < 3) {
    errors.overrideReason = `The estimate was ${estimated} miles. Say why you drove a different distance.`;
  }

  const rate = errors.date ? null : await rateOn(tx, input.date);
  if (!errors.date && !rate) errors.date = "There's no mileage rate for that date yet. Please ask an admin.";

  if (Object.keys(errors).length > 0 || !from || !to || !miles || !rate) return { errors };

  const asStop = (p: ResolvedPoint): Stop => ({ label: p.label, address: p.address, placeId: p.placeId, isHome: p.isHome });
  return {
    trip: {
      itemDate: input.date,
      purpose: input.purpose,
      programId: input.programId,
      notes: input.notes || null,
      amountCents: mileageAmountCents(miles, rate.rateCents),
      details: {
        fromPlaceId: from.placeId,
        fromLabel: from.label,
        fromAddress: from.address,
        fromIsHome: from.isHome,
        toPlaceId: to.placeId,
        toLabel: to.label,
        toAddress: to.address,
        toIsHome: to.isHome,
        stops: stops.map(asStop),
        roundTrip: input.roundTrip,
        milesEstimated: estimated,
        miles,
        overrideReason: overridden ? input.overrideReason : null,
        rateId: rate.id,
        rateCents: rate.rateCents,
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------------------------

export async function createTrip(viewer: Viewer, input: TripInput) {
  return withUser(viewer.userId, async (tx) => {
    const worked = await workOutTrip(tx, input);
    if ("errors" in worked) return worked;
    const { details, ...item } = worked.trip;
    const [created] = await tx
      .insert(requestItems)
      .values({ ...item, requestType: REQUEST_TYPE, ownerId: viewer.staffId })
      .returning({ id: requestItems.id });
    await tx.insert(mileageDetails).values({ ...details, itemId: created.id });
    return { id: created.id };
  });
}

export async function updateTrip(viewer: Viewer, itemId: string, input: TripInput) {
  if (!uuid.safeParse(itemId).success) throw new UserError("Trip not found.");
  return withUser(viewer.userId, async (tx) => {
    const worked = await workOutTrip(tx, input);
    if ("errors" in worked) return worked;
    const { details, ...item } = worked.trip;
    // RLS only lets the owner update a trip that isn't in a locked claim.
    const [updated] = await tx
      .update(requestItems)
      .set({ itemDate: item.itemDate, purpose: item.purpose, programId: item.programId, notes: item.notes, amountCents: item.amountCents, updatedAt: new Date() })
      .where(eq(requestItems.id, itemId))
      .returning({ id: requestItems.id, requestId: requestItems.requestId });
    if (!updated) throw new UserError("This trip can't be changed. It may be in a claim that's waiting for approval or already approved.");
    await tx.update(mileageDetails).set(details).where(eq(mileageDetails.itemId, itemId));
    return { id: updated.id, requestId: updated.requestId };
  });
}

export async function deleteTrip(viewer: Viewer, itemId: string) {
  if (!uuid.safeParse(itemId).success) throw new UserError("Trip not found.");
  return withUser(viewer.userId, async (tx) => {
    const [deleted] = await tx.delete(requestItems).where(eq(requestItems.id, itemId)).returning({ requestId: requestItems.requestId });
    if (!deleted) throw new UserError("This trip can't be deleted. It may be in a claim that's waiting for approval or already approved.");
    return deleted;
  });
}

// ---------------------------------------------------------------------------------------------
// What the trip form needs
// ---------------------------------------------------------------------------------------------

export type FormPlace = { id: string; label: string; address: string; lat: number | null; lng: number | null; isHome: boolean; shared: boolean };

export async function tripFormOptions(viewer: Viewer) {
  return withUser(viewer.userId, async (tx) => {
    const places = await tx
      .select()
      .from(savedPlaces)
      .where(or(isNull(savedPlaces.ownerId), eq(savedPlaces.ownerId, viewer.staffId)))
      .orderBy(asc(savedPlaces.label));
    const programList = await tx.select().from(programs).where(eq(programs.active, true)).orderBy(asc(programs.code));
    const rateList = await tx.select().from(rates).where(eq(rates.requestType, REQUEST_TYPE)).orderBy(desc(rates.effectiveFrom));
    const settings = await readSettings(tx);
    const officeFirst = (a: FormPlace, b: FormPlace) =>
      Number(b.label === "Main office") - Number(a.label === "Main office") || a.label.localeCompare(b.label);
    return {
      places: places
        .map((p) => ({ id: p.id, label: p.label, address: p.address, lat: p.lat, lng: p.lng, isHome: p.isHome, shared: p.ownerId === null }))
        .sort(officeFirst),
      programs: programList.map((p) => ({ id: p.id, code: p.code, name: p.name })),
      rates: rateList.map((r) => ({ effectiveFrom: r.effectiveFrom, rateCents: r.rateCents })),
      homeTripRule: settings.homeTripRule,
      requireProgram: settings.requireProgram,
      today: todayIso(),
    };
  });
}

export type TripFormOptions = Awaited<ReturnType<typeof tripFormOptions>>;
