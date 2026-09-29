import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TripInput } from "@/lib/requests/mileage";
import { workOutTrip } from "@/lib/requests/mileage";
import { todayIso } from "@/lib/format";
import { as, createTestDb, rows, sql, type TestDb } from "../support/db";

let t: TestDb;
let office: string;
let cedar: string;
let rowanHome: string;
let program: string;

beforeAll(async () => {
  t = await createTestDb();
  const places = await rows<{ id: string; label: string; owner_id: string | null }>(t.db, sql`select id, label, owner_id from public.saved_places`);
  office = places.find((p) => p.label === "Main office")!.id;
  cedar = places.find((p) => p.label === "Cedar Grove Elementary")!.id;
  rowanHome = places.find((p) => p.label === "Home" && p.owner_id === "00000000-0000-4000-8000-000000000101")!.id;
  program = (await rows<{ id: string }>(t.db, sql`select id from public.programs where code = 'EXL'`))[0].id;
});
afterAll(async () => {
  await t.close();
});

function trip(overrides: Partial<TripInput> = {}): TripInput {
  return {
    date: todayIso(),
    from: { placeId: office, address: "" },
    stops: [],
    to: { placeId: cedar, address: "" },
    roundTrip: false,
    miles: "",
    overrideReason: "",
    purpose: "Site visit",
    programId: program,
    notes: "",
    ...overrides,
  };
}

const work = (input: TripInput) => as(t, "rowan", (tx) => workOutTrip(tx, input));

describe("working out a trip", () => {
  it("estimates miles between saved places and prices them at the day's rate", async () => {
    const result = await work(trip());
    if (!("trip" in result)) throw new Error(JSON.stringify(result.errors));
    const d = result.trip.details;
    expect(d.milesEstimated).toBe(d.miles);
    expect(Number(d.miles)).toBeGreaterThan(4);
    expect(d.rateCents).toBe("72.50");
    expect(result.trip.amountCents).toBe(Math.floor((Number(d.miles) * 10 * 7250 + 500) / 1000));
  });

  it("doubles the distance for a round trip", async () => {
    const one = await work(trip());
    const round = await work(trip({ roundTrip: true }));
    if (!("trip" in one) || !("trip" in round)) throw new Error("expected trips");
    expect(Number(round.trip.details.miles)).toBeCloseTo(Number(one.trip.details.miles) * 2, 0);
  });

  it("uses the rate in force on the trip's date", async () => {
    const result = await work(trip({ date: `${new Date().getUTCFullYear() - 1}-12-15` }));
    if (!("trip" in result)) throw new Error(JSON.stringify(result.errors));
    expect(result.trip.details.rateCents).toBe("70.00");
  });

  it("needs a reason when the miles differ from the estimate", async () => {
    const noReason = await work(trip({ miles: "40" }));
    expect("errors" in noReason && noReason.errors.overrideReason).toBeTruthy();
    const withReason = await work(trip({ miles: "40", overrideReason: "Detour" }));
    if (!("trip" in withReason)) throw new Error(JSON.stringify(withReason.errors));
    expect(withReason.trip.details.miles).toBe("40.0");
    expect(withReason.trip.details.overrideReason).toBe("Detour");
  });

  it("asks for miles when an address has no estimate", async () => {
    const typed = trip({ to: { placeId: null, address: "55 Somewhere St, Sacramento" } });
    const missing = await work(typed);
    expect("errors" in missing && missing.errors.miles).toBe("Enter the miles you drove.");
    const given = await work({ ...typed, miles: "6.25" });
    if (!("trip" in given)) throw new Error(JSON.stringify(given.errors));
    expect(given.trip.details).toMatchObject({ milesEstimated: null, miles: "6.3", toPlaceId: null, toLabel: "55 Somewhere St, Sacramento" });
  });

  it("rejects future dates, missing purpose and missing program", async () => {
    const result = await work(trip({ date: "2999-01-01", purpose: "", programId: null }));
    if (!("errors" in result)) throw new Error("expected errors");
    expect(Object.keys(result.errors).sort()).toEqual(["date", "programId", "purpose"]);
  });

  it("can't use someone else's saved place", async () => {
    const result = await as(t, "tessa", (tx) => workOutTrip(tx, trip({ from: { placeId: rowanHome, address: "" } })));
    expect("errors" in result && result.errors.from).toBeTruthy();
  });

  it("follows the home-trip setting", async () => {
    const fromHome = trip({ from: { placeId: rowanHome, address: "" } });
    const flagged = await work(fromHome);
    if (!("trip" in flagged)) throw new Error(JSON.stringify(flagged.errors));
    expect(flagged.trip.details.fromIsHome).toBe(true);

    await t.db.execute(sql`update public.settings set value = '"block"' where key = 'home_trip_rule'`);
    const blocked = await work(fromHome);
    expect("errors" in blocked && blocked.errors.form).toMatch(/home/);
    await t.db.execute(sql`update public.settings set value = '"flag"' where key = 'home_trip_rule'`);
  });
});
