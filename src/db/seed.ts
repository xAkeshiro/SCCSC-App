/**
 * Fake demo data. Every name, phone number, address and amount here is made up.
 * Phone numbers use the 555-01xx range, which is reserved for fiction.
 *
 * Dates are relative to today so the demo always looks current. Claims are spread across every
 * status, with a matching history, so each screen has something to show.
 */
import { sql } from "drizzle-orm";
import { demoEstimateMiles } from "@/lib/distance";
import { mileageAmountCents, normalizeMiles } from "@/lib/money";
import type { Database, Tx } from "./index";
import * as s from "./schema";

/** Fixed ids so the demo persona switcher and tests can refer to people. */
export const DEMO = {
  rowan: { staffId: "00000000-0000-4000-8000-000000000101", userId: "00000000-0000-4000-9000-000000000101" },
  tessa: { staffId: "00000000-0000-4000-8000-000000000102", userId: "00000000-0000-4000-9000-000000000102" },
  marcus: { staffId: "00000000-0000-4000-8000-000000000103", userId: "00000000-0000-4000-9000-000000000103" },
  lena: { staffId: "00000000-0000-4000-8000-000000000104", userId: "00000000-0000-4000-9000-000000000104" },
  owen: { staffId: "00000000-0000-4000-8000-000000000105", userId: "00000000-0000-4000-9000-000000000105" },
  hazel: { staffId: "00000000-0000-4000-8000-000000000106", userId: "00000000-0000-4000-9000-000000000106" },
  sam: { staffId: "00000000-0000-4000-8000-000000000107", userId: "00000000-0000-4000-9000-000000000107" },
  /** On the roster but has never signed in: try signing in as "Felix Hartwell", (916) 555-0108. */
  felix: { staffId: "00000000-0000-4000-8000-000000000108", userId: null },
  /** Verified their phone but isn't on the roster: waiting in the access request queue. */
  nora: { staffId: null, userId: "00000000-0000-4000-9000-000000000109" },
} as const;

type PersonKey = keyof typeof DEMO;
type Role = (typeof s.appRole.enumValues)[number];

const PEOPLE: {
  key: Exclude<PersonKey, "nora">;
  name: string;
  phone: string;
  roles: Role[];
  coordinator: PersonKey | null;
  program: string;
}[] = [
  { key: "rowan", name: "Rowan Ellery", phone: "+19165550101", roles: ["employee"], coordinator: "lena", program: "EXL" },
  { key: "tessa", name: "Tessa Quill", phone: "+19165550102", roles: ["employee"], coordinator: "lena", program: "EXL" },
  { key: "marcus", name: "Marcus Holloway", phone: "+19165550103", roles: ["employee"], coordinator: "owen", program: "YWF" },
  { key: "lena", name: "Lena Fairbanks", phone: "+19165550104", roles: ["employee", "coordinator"], coordinator: "owen", program: "EXL" },
  { key: "owen", name: "Owen Castellano", phone: "+19165550105", roles: ["employee", "coordinator"], coordinator: null, program: "YWF" },
  { key: "hazel", name: "Hazel Brightwater", phone: "+19165550106", roles: ["employee", "finance"], coordinator: "owen", program: "ADM" },
  { key: "sam", name: "Sam Whitlock", phone: "+19165550107", roles: ["employee", "admin"], coordinator: "owen", program: "ADM" },
  { key: "felix", name: "Felix Hartwell", phone: "+19165550108", roles: ["employee"], coordinator: "lena", program: "ECV" },
];

const PROGRAMS = [
  { code: "EXL", name: "Expanded Learning (after school)" },
  { code: "YWF", name: "Youth Workforce" },
  { code: "ECV", name: "Experience Corps volunteers" },
  { code: "ADM", name: "General and administrative" },
];

/** Shared places. Fictional names and addresses; coordinates are rough Sacramento-area points. */
const PLACES = [
  { key: "office", label: "Main office", address: "100 Example Plaza, Sacramento, CA 95833", lat: 38.5905, lng: -121.418 },
  { key: "cedar", label: "Cedar Grove Elementary", address: "2100 Sample Ave, Sacramento, CA 95817", lat: 38.5412, lng: -121.4617 },
  { key: "willow", label: "Willow Creek Middle", address: "3300 Example Blvd, Sacramento, CA 95823", lat: 38.4968, lng: -121.4394 },
  { key: "harbor", label: "Harbor Point High", address: "4500 Demo Rd, Sacramento, CA 95838", lat: 38.6431, lng: -121.4705 },
  { key: "delta", label: "Delta Family Resource Center", address: "780 Placeholder St, West Sacramento, CA 95691", lat: 38.5805, lng: -121.5302 },
  { key: "county", label: "County education office", address: "10 Fictional Way, Mather, CA 95655", lat: 38.5561, lng: -121.298 },
] as const;
type PlaceKey = (typeof PLACES)[number]["key"] | "home";

/** Personal "Home" places (fictional) for the people who log trips from home. */
const HOMES: Partial<Record<PersonKey, { address: string; lat: number; lng: number }>> = {
  rowan: { address: "12 Demo Ct, Sacramento, CA 95822", lat: 38.5102, lng: -121.4921 },
  marcus: { address: "48 Sample Ln, Elk Grove, CA 95758", lat: 38.4219, lng: -121.4238 },
  tessa: { address: "7 Fiction Dr, Rancho Cordova, CA 95670", lat: 38.5891, lng: -121.2903 },
};

const RATES = [
  { effectiveFrom: "2025-01-01", rateCents: "70.00", note: "Sample: IRS standard business rate for 2025. Confirm before go-live." },
  { effectiveFrom: "2026-01-01", rateCents: "72.50", note: "Sample: IRS standard business rate for 2026. Confirm before go-live." },
];

export const DEFAULT_SETTINGS: { key: string; value: unknown; description: string }[] = [
  {
    key: "home_trip_rule",
    value: "flag",
    description:
      "Trips that start or end at home (open question 3). 'allow': no flag. 'flag': the approver sees a flag. 'block': they can't be logged.",
  },
  {
    key: "bulk_approve_max_cents",
    value: 10000,
    description: "Claims at or under this total, with no flags, can be approved in bulk.",
  },
  { key: "require_program", value: true, description: "Every trip must have a program or grant code." },
  { key: "session_days", value: 30, description: "How long someone stays signed in on a device." },
];

function isoDaysAgo(days: number, from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function tsDaysAgo(days: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  // Business hours in Sacramento (UTC-7/-8).
  d.setUTCHours(hour + 7, minute, 0, 0);
  return d;
}

export async function seedIfEmpty(db: Database) {
  const existing = await db.select({ id: s.requestTypes.id }).from(s.requestTypes).limit(1);
  if (existing.length > 0) return false;
  await db.transaction((tx) => seed(tx));
  return true;
}

async function seed(tx: Tx) {
  // Reference data -----------------------------------------------------------------------------
  await tx.insert(s.requestTypes).values({
    id: "mileage",
    name: "Mileage",
    description: "Business miles driven in a personal vehicle.",
    config: { unit: "mile" },
  });
  const programRows = await tx.insert(s.programs).values(PROGRAMS).returning();
  const programId = (code: string) => programRows.find((p) => p.code === code)!.id;

  const rateRows = await tx
    .insert(s.rates)
    .values(RATES.map((r) => ({ ...r, requestType: "mileage" })))
    .returning();
  const rateFor = (date: string) =>
    [...rateRows].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).find((r) => r.effectiveFrom <= date)!;

  await tx.insert(s.settings).values(DEFAULT_SETTINGS.map((x) => ({ ...x, value: x.value as object })));

  // People -------------------------------------------------------------------------------------
  for (const key of Object.keys(DEMO) as PersonKey[]) {
    const userId = DEMO[key].userId;
    const person = PEOPLE.find((p) => p.key === key);
    const phone = person?.phone ?? "+19165550109";
    if (userId) {
      await tx.execute(sql`insert into auth.users (id, phone) values (${userId}::uuid, ${phone.slice(1)})`);
    }
  }
  for (const p of PEOPLE) {
    await tx.insert(s.staff).values({
      id: DEMO[p.key].staffId!,
      userId: DEMO[p.key].userId,
      fullName: p.name,
      source: p.key === "felix" ? "roster" : "seed",
      defaultProgramId: programId(p.program),
    });
    await tx.insert(s.staffPrivate).values({ staffId: DEMO[p.key].staffId!, phoneE164: p.phone });
    await tx.insert(s.staffRoles).values(p.roles.map((role) => ({ staffId: DEMO[p.key].staffId!, role })));
  }
  for (const p of PEOPLE) {
    if (!p.coordinator) continue;
    await tx
      .update(s.staff)
      .set({ coordinatorId: DEMO[p.coordinator].staffId })
      .where(sql`${s.staff.id} = ${DEMO[p.key].staffId}`);
  }
  await tx.insert(s.accessRequests).values({
    userId: DEMO.nora.userId,
    fullName: "Nora Pennington",
    phoneE164: "+19165550109",
    createdAt: tsDaysAgo(1, 16, 20),
  });

  // Places -------------------------------------------------------------------------------------
  const placeRows = await tx
    .insert(s.savedPlaces)
    .values(PLACES.map(({ label, address, lat, lng }) => ({ label, address, lat, lng })))
    .returning();
  const place = (key: Exclude<PlaceKey, "home">) => {
    const def = PLACES.find((p) => p.key === key)!;
    return { ...placeRows.find((r) => r.label === def.label)!, isHome: false };
  };
  const homes: Partial<Record<PersonKey, typeof s.savedPlaces.$inferSelect>> = {};
  for (const [key, home] of Object.entries(HOMES) as [PersonKey, (typeof HOMES)[PersonKey]][]) {
    const [row] = await tx
      .insert(s.savedPlaces)
      .values({ ownerId: DEMO[key].staffId, label: "Home", isHome: true, ...home! })
      .returning();
    homes[key] = row;
  }

  // Trips and claims ---------------------------------------------------------------------------
  const staffName = (key: PersonKey) => PEOPLE.find((p) => p.key === key)!.name;

  type TripSpec = {
    owner: PersonKey;
    daysAgo: number;
    route: PlaceKey[];
    roundTrip?: boolean;
    purpose: string;
    program?: string;
    notes?: string;
    /** Claimed miles that differ from the estimate, with the reason. */
    override?: { miles: string; reason: string };
  };

  async function addTrip(t: TripSpec, requestId: string | null) {
    const pts = t.route.map((k) => (k === "home" ? { ...homes[t.owner]!, isHome: true } : place(k)));
    const estimate = demoEstimateMiles(pts, Boolean(t.roundTrip));
    const miles = t.override ? normalizeMiles(t.override.miles)! : normalizeMiles(estimate!)!;
    const date = isoDaysAgo(t.daysAgo);
    const rate = rateFor(date);
    const owner = PEOPLE.find((p) => p.key === t.owner)!;
    const [item] = await tx
      .insert(s.requestItems)
      .values({
        requestType: "mileage",
        ownerId: DEMO[t.owner].staffId!,
        requestId,
        itemDate: date,
        purpose: t.purpose,
        programId: programId(t.program ?? owner.program),
        notes: t.notes ?? null,
        amountCents: mileageAmountCents(miles, rate.rateCents),
        createdAt: tsDaysAgo(t.daysAgo, 17),
      })
      .returning();
    const first = pts[0];
    const last = pts[pts.length - 1];
    await tx.insert(s.mileageDetails).values({
      itemId: item.id,
      fromPlaceId: first.id,
      fromLabel: first.label,
      fromAddress: first.address,
      fromIsHome: first.isHome,
      toPlaceId: last.id,
      toLabel: last.label,
      toAddress: last.address,
      toIsHome: last.isHome,
      stops: pts.slice(1, -1).map((p) => ({ label: p.label, address: p.address, placeId: p.id, isHome: p.isHome })),
      roundTrip: Boolean(t.roundTrip),
      milesEstimated: estimate === null ? null : normalizeMiles(estimate),
      miles,
      overrideReason: t.override?.reason ?? null,
      rateId: rate.id,
      rateCents: rate.rateCents,
    });
  }

  type Step = {
    action: (typeof s.requestAction.enumValues)[number];
    by: PersonKey;
    daysAgo: number;
    to: (typeof s.requestStatus.enumValues)[number];
    comment?: string;
  };

  async function addClaim(owner: PersonKey, trips: Omit<TripSpec, "owner">[], steps: Step[], note?: string) {
    const last = steps[steps.length - 1];
    const submitted = [...steps].reverse().find((x) => x.action === "submitted" || x.action === "resubmitted");
    const decided = [...steps].reverse().find((x) => ["approved", "returned", "denied"].includes(x.action));
    const [req] = await tx
      .insert(s.requests)
      .values({
        requestType: "mileage",
        ownerId: DEMO[owner].staffId!,
        status: last.to,
        employeeNote: note ?? null,
        submittedAt: submitted ? tsDaysAgo(submitted.daysAgo, 17, 5) : null,
        decidedAt: decided ? tsDaysAgo(decided.daysAgo, 9, 40) : null,
        decidedBy: decided ? DEMO[decided.by].staffId : null,
        createdAt: tsDaysAgo(steps[0].daysAgo, 17),
      })
      .returning();
    for (const t of trips) await addTrip({ ...t, owner }, req.id);
    let from: Step["to"] | null = null;
    for (const step of steps) {
      const hour = step.action === "submitted" || step.action === "resubmitted" ? 17 : step.action === "paid" ? 14 : 9;
      await tx.insert(s.requestEvents).values({
        requestId: req.id,
        actorId: DEMO[step.by].staffId,
        actorName: staffName(step.by),
        action: step.action,
        fromStatus: from,
        toStatus: step.to,
        comment: step.comment ?? (step.action === "submitted" ? (note ?? null) : null),
        createdAt: tsDaysAgo(step.daysAgo, hour, 5),
      });
      from = step.to;
    }
    return req.id;
  }

  // Rowan: two trips not yet submitted, one claim waiting, one approved, one paid.
  await addTrip({ owner: "rowan", daysAgo: 1, route: ["office", "cedar"], roundTrip: true, purpose: "Family literacy night setup" }, null);
  await addTrip(
    { owner: "rowan", daysAgo: 2, route: ["office", "harbor", "willow"], purpose: "Site visits: attendance check-ins" },
    null,
  );
  await addClaim(
    "rowan",
    [
      { daysAgo: 9, route: ["office", "cedar"], roundTrip: true, purpose: "After-school program site visit" },
      { daysAgo: 7, route: ["office", "willow", "office"], purpose: "Deliver curriculum supplies" },
      { daysAgo: 5, route: ["office", "county"], roundTrip: true, purpose: "Quarterly grant meeting" },
    ],
    [{ action: "submitted", by: "rowan", daysAgo: 3, to: "submitted" }],
  );
  const rowanApproved = await addClaim(
    "rowan",
    [
      { daysAgo: 24, route: ["office", "harbor"], roundTrip: true, purpose: "Parent orientation" },
      { daysAgo: 22, route: ["office", "delta"], roundTrip: true, purpose: "Family resource fair" },
    ],
    [
      { action: "submitted", by: "rowan", daysAgo: 20, to: "submitted" },
      { action: "approved", by: "lena", daysAgo: 18, to: "approved" },
    ],
  );
  void rowanApproved;
  const rowanPaid = await addClaim(
    "rowan",
    [
      { daysAgo: 44, route: ["office", "cedar"], roundTrip: true, purpose: "Program launch at Cedar Grove" },
      { daysAgo: 42, route: ["office", "willow"], roundTrip: true, purpose: "Staff training at Willow Creek" },
    ],
    [
      { action: "submitted", by: "rowan", daysAgo: 40, to: "submitted" },
      { action: "approved", by: "lena", daysAgo: 38, to: "approved" },
      { action: "batched", by: "hazel", daysAgo: 33, to: "batched", comment: "Added to batch B-101" },
      { action: "paid", by: "hazel", daysAgo: 30, to: "paid", comment: "Paid in batch B-101" },
    ],
  );

  // Tessa: a returned claim to fix, a claim in the open batch, one trip not yet submitted.
  await addTrip({ owner: "tessa", daysAgo: 1, route: ["office", "delta"], roundTrip: true, purpose: "Community partner meeting" }, null);
  await addClaim(
    "tessa",
    [
      { daysAgo: 10, route: ["office", "cedar"], roundTrip: true, purpose: "Enrichment class observation" },
      { daysAgo: 8, route: ["home", "harbor"], purpose: "Early program opening", notes: "Went straight to site." },
    ],
    [
      { action: "submitted", by: "tessa", daysAgo: 6, to: "submitted" },
      {
        action: "returned",
        by: "lena",
        daysAgo: 4,
        to: "returned",
        comment:
          "The Harbor Point trip started from home. Please change the start to the main office (or add a note explaining why home), then resubmit.",
      },
    ],
  );
  const tessaBatched = await addClaim(
    "tessa",
    [
      { daysAgo: 19, route: ["office", "willow"], roundTrip: true, purpose: "Student showcase" },
      { daysAgo: 17, route: ["office", "county"], roundTrip: true, purpose: "Compliance training" },
    ],
    [
      { action: "submitted", by: "tessa", daysAgo: 16, to: "submitted" },
      { action: "approved", by: "lena", daysAgo: 14, to: "approved" },
      { action: "batched", by: "hazel", daysAgo: 2, to: "batched", comment: "Added to batch B-102" },
    ],
  );

  // Marcus: a submitted claim with a home trip and a miles override; a denied claim.
  await addClaim(
    "marcus",
    [
      { daysAgo: 6, route: ["home", "harbor"], purpose: "Youth job fair setup (early start)" },
      {
        daysAgo: 4,
        route: ["office", "delta", "office"],
        purpose: "Employer site visit",
        override: { miles: "11.0", reason: "Detour: road closure on the bridge, went the long way." },
      },
    ],
    [{ action: "submitted", by: "marcus", daysAgo: 2, to: "submitted" }],
    "The job fair started at 7am so I drove straight from home.",
  );
  await addClaim(
    "marcus",
    [
      { daysAgo: 29, route: ["home", "office"], purpose: "Office day" },
      { daysAgo: 28, route: ["home", "office"], purpose: "Office day" },
    ],
    [
      { action: "submitted", by: "marcus", daysAgo: 27, to: "submitted" },
      {
        action: "denied",
        by: "owen",
        daysAgo: 25,
        to: "denied",
        comment: "These are regular commute trips between home and the office, which aren't reimbursable. Happy to talk it through.",
      },
    ],
  );

  // Lena (a coordinator) submits her own claim, which goes to her coordinator, Owen.
  await addClaim(
    "lena",
    [
      { daysAgo: 3, route: ["office", "cedar", "willow", "office"], purpose: "Coordinator site rounds" },
      { daysAgo: 2, route: ["office", "harbor"], roundTrip: true, purpose: "Site lead check-in" },
    ],
    [{ action: "submitted", by: "lena", daysAgo: 1, to: "submitted" }],
  );

  // Owen has no coordinator, so an admin (Sam) reviews his claims.
  await addClaim(
    "owen",
    [{ daysAgo: 12, route: ["office", "county"], roundTrip: true, purpose: "Workforce board meeting" }],
    [
      { action: "submitted", by: "owen", daysAgo: 11, to: "submitted" },
      { action: "approved", by: "sam", daysAgo: 10, to: "approved" },
    ],
  );

  // Hazel (finance) has a paid claim in the same batch as Rowan's.
  const hazelPaid = await addClaim(
    "hazel",
    [{ daysAgo: 41, route: ["office", "county"], roundTrip: true, purpose: "Audit prep meeting" }],
    [
      { action: "submitted", by: "hazel", daysAgo: 39, to: "submitted" },
      { action: "approved", by: "owen", daysAgo: 37, to: "approved" },
      { action: "batched", by: "hazel", daysAgo: 33, to: "batched", comment: "Added to batch B-101" },
      { action: "paid", by: "hazel", daysAgo: 30, to: "paid", comment: "Paid in batch B-101" },
    ],
  );

  // Batches ------------------------------------------------------------------------------------
  const [paidBatch] = await tx
    .insert(s.batches)
    .values({
      periodStart: isoDaysAgo(45),
      periodEnd: isoDaysAgo(32),
      status: "paid",
      createdBy: DEMO.hazel.staffId,
      createdAt: tsDaysAgo(33, 11),
      exportedAt: tsDaysAgo(33, 11, 30),
      exportedBy: DEMO.hazel.staffId,
      paidOn: isoDaysAgo(30),
      paidBy: DEMO.hazel.staffId,
    })
    .returning();
  const [openBatch] = await tx
    .insert(s.batches)
    .values({
      periodStart: isoDaysAgo(17),
      periodEnd: isoDaysAgo(4),
      status: "open",
      createdBy: DEMO.hazel.staffId,
      createdAt: tsDaysAgo(2, 11),
    })
    .returning();
  await tx.execute(
    sql`update public.requests set batch_id = ${paidBatch.id}::uuid where id in (${rowanPaid}::uuid, ${hazelPaid}::uuid)`,
  );
  await tx.execute(sql`update public.requests set batch_id = ${openBatch.id}::uuid where id = ${tessaBatched}::uuid`);
  await tx.execute(
    sql`update public.batches b set total_cents = coalesce((select sum(r.total_cents) from public.requests r where r.batch_id = b.id), 0)`,
  );
}
