/**
 * Fake demo data. Every name, email, phone number, address and amount here is made up, except
 * Eden Redona's own roster entry (the app's owner, at Eden's request, so Eden can sign in to the
 * demo with a real emailed code). Phone numbers use the 555-01xx range, which is reserved for
 * fiction, and emails use example.org, which is reserved for examples.
 *
 * Budget codes are the exception too: the funds, accounts and school tags below are a small part
 * of SCCSC's real Aplos lists (public school districts and schools, and the travel, phone and
 * supply accounts), so a payment file made in the demo can be test-imported into Aplos. The full
 * lists are imported by an admin (Admin → Budget codes), never stored here.
 *
 * Dates are relative to today so the demo always looks current. Claims are spread across every
 * status, with a matching history, so each screen has something to show.
 */
import { sql } from "drizzle-orm";
import { demoEstimateMiles } from "@/lib/distance";
import { mileageAmountCents, normalizeMiles } from "@/lib/money";
import { todayIso } from "@/lib/format";
import { addMonths, formatMonth, formatMonths, latestOpenPeriod, periodOf, phoneAmountCents, type Period } from "@/lib/requests/phone";
import { fakeBillPdf } from "./fake-bill";
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
  /** On the roster but has never signed in: try signing in as "Felix Hartwell", felix.hartwell@example.org. */
  felix: { staffId: "00000000-0000-4000-8000-000000000108", userId: null },
  /** Verified their email but isn't on the roster: waiting in the access request queue. */
  nora: { staffId: null, userId: "00000000-0000-4000-9000-000000000109" },
  /** The app's owner (real name and work email, at Eden's request). On the roster, so an emailed code signs straight in. */
  eden: { staffId: "00000000-0000-4000-8000-000000000110", userId: null },
} as const;

type PersonKey = keyof typeof DEMO;
type Role = (typeof s.appRole.enumValues)[number];

const PEOPLE: {
  key: Exclude<PersonKey, "nora">;
  name: string;
  email: string;
  phone?: string;
  roles: Role[];
  coordinator: PersonKey | null;
  /** Their usual school or site (an Aplos tag code). */
  site: string;
}[] = [
  { key: "rowan", name: "Rowan Ellery", email: "rowan.ellery@example.org", phone: "+19165550101", roles: ["employee"], coordinator: "lena", site: "211" },
  { key: "tessa", name: "Tessa Quill", email: "tessa.quill@example.org", phone: "+19165550102", roles: ["employee"], coordinator: "lena", site: "211" },
  { key: "marcus", name: "Marcus Holloway", email: "marcus.holloway@example.org", phone: "+19165550103", roles: ["employee"], coordinator: "owen", site: "252" },
  { key: "lena", name: "Lena Fairbanks", email: "lena.fairbanks@example.org", phone: "+19165550104", roles: ["employee", "coordinator"], coordinator: "owen", site: "211" },
  { key: "owen", name: "Owen Castellano", email: "owen.castellano@example.org", phone: "+19165550105", roles: ["employee", "coordinator"], coordinator: null, site: "431" },
  { key: "hazel", name: "Hazel Brightwater", email: "hazel.brightwater@example.org", phone: "+19165550106", roles: ["employee", "finance"], coordinator: "owen", site: "9" },
  { key: "sam", name: "Sam Whitlock", email: "sam.whitlock@example.org", phone: "+19165550107", roles: ["employee", "admin"], coordinator: "owen", site: "9" },
  { key: "felix", name: "Felix Hartwell", email: "felix.hartwell@example.org", phone: "+19165550108", roles: ["employee"], coordinator: "lena", site: "123" },
  { key: "eden", name: "Eden Redona", email: "eden.redona@sccsc.org", roles: ["employee", "admin"], coordinator: "owen", site: "9" },
];

const NORA_EMAIL = "nora.pennington@example.org";

/** Funds: the Center and the four school districts (names as in Aplos). */
const FUNDS = [
  { code: "1", name: "Center/Central" },
  { code: "100", name: "Sacramento City USD" },
  { code: "200", name: "Twin Rivers USD" },
  { code: "300", name: "Elk Grove USD" },
  { code: "400", name: "Natomas USD" },
];

/** The expense accounts reimbursements are charged to (names as in Aplos), under their parent account. */
const ACCOUNTS = [
  { number: "5702", name: "Local Travel - auto (Direct)", parentNumber: "8550" },
  { number: "5703", name: "Parking- to be reimbursed (Direct)", parentNumber: "8550" },
  { number: "5700", name: "Local Travel - auto (Indirect)", parentNumber: "8551" },
  { number: "5701", name: "Parking- to be reimbursed (Indirect)", parentNumber: "8551" },
  { number: "5431", name: "Telephone (Direct)", parentNumber: "8552" },
  { number: "5430", name: "Telephone (Indirect)", parentNumber: "8553" },
  { number: "7305", name: "Classroom Supplies (Direct)", parentNumber: "8540" },
  { number: "5310", name: "Office Supplies (Indirect)", parentNumber: "8541" },
  { number: "7481", name: "Consumables (Direct)", parentNumber: "8554" },
  { number: "7482", name: "Consumables (Indirect)", parentNumber: "8555" },
];

/** A few Aplos "Schools" tags per fund (public schools, and the Center's own sites). */
const SITES = [
  { code: "6", name: "Creekside Office", fund: "1" },
  { code: "9", name: "T Street Building, Ping Office", fund: "1" },
  { code: "123", name: "SEQUOIA ELEMENTARY", fund: "100" },
  { code: "126", name: "ETHEL PHILLIPS ELEMENTARY", fund: "100" },
  { code: "185", name: "WILLIAM LAND ELEMENTARY SCHOOL", fund: "100" },
  { code: "211", name: "FOOTHILL HIGH SCHOOL", fund: "200" },
  { code: "252", name: "LAS PALMAS ELEMENTARY", fund: "200" },
  { code: "265", name: "FOOTHILL OAKS ELEMENTARY SCHOOL", fund: "200" },
  { code: "309", name: "MONTEREY TRAIL HIGH SCHOOL", fund: "300" },
  { code: "335", name: "BARBARA MORSE ELEMENTARY", fund: "300" },
  { code: "431", name: "BANNON CREEK K-8 SCHOOL", fund: "400" },
  { code: "433", name: "WITTER RANCH ELEMENTARY", fund: "400" },
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
  { effectiveFrom: "2026-01-01", rateCents: "76.00", note: "From the 2026 mileage claim form ($0.76 a mile). Confirm before go-live." },
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
  { key: "require_site", value: true, description: "Every trip and phone bill must say which school or site it is for." },
  { key: "session_days", value: 30, description: "How long someone stays signed in on a device." },
  {
    key: "phone_months_per_claim",
    value: 2,
    description:
      "Phone bills are claimed this many months at a time, in periods from January (2: Jan–Feb claimed from Feb 1, Mar–Apr from Apr 1, …). One of 1, 2, 3, 4, 6 or 12.",
  },
  {
    key: "phone_periods_back",
    value: 1,
    description: "How many earlier phone bill periods can still be claimed after the latest one opens. A starting guess; confirm with finance.",
  },
  {
    key: "aplos_accounts",
    value: { mileageDirect: "5702", mileageIndirect: "5700", parkingDirect: "5703", parkingIndirect: "5701", phone: "5430" },
    description:
      "Which Aplos account each kind of reimbursement goes to. Trips and parking follow the trip's direct or indirect choice. Set on Admin → Budget codes.",
  },
  {
    key: "max_trip_age_days",
    value: 365,
    description: "Oldest trip that can be logged, in days. A starting guess; confirm with finance (brief, open question 13).",
  },
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
  // Request types come from a migration, so check for people instead.
  const existing = await db.select({ id: s.staff.id }).from(s.staff).limit(1);
  if (existing.length > 0) return false;
  await db.transaction((tx) => seed(tx));
  return true;
}

/**
 * Fixed ids for everything the seed creates, in creation order. On Vercel the demo database lives
 * in memory and each server instance seeds its own copy; fixed ids mean a link to a demo claim or
 * batch works whichever instance answers.
 */
function idSequence() {
  let n = 0;
  return () => `00000000-0000-4000-a000-${(++n).toString(16).padStart(12, "0")}`;
}

async function seed(tx: Tx) {
  const nextId = idSequence();

  // Reference data (request types come from migration 0004) -----------------------------------
  await tx.insert(s.funds).values(FUNDS.map((f) => ({ ...f, aplosName: `${f.code} - ${f.name}` })));
  await tx.insert(s.accounts).values(ACCOUNTS.map((a) => ({ ...a, aplosName: `${a.number} - ${a.name}` })));
  const siteRows = await tx
    .insert(s.sites)
    .values(SITES.map((x) => ({ id: nextId(), code: x.code, name: x.name, fundCode: x.fund, aplosName: `${x.code} - ${x.name}` })))
    .returning();
  const siteId = (code: string) => siteRows.find((x) => x.code === code)!.id;

  const rateRows = await tx
    .insert(s.rates)
    .values(RATES.map((r) => ({ ...r, id: nextId(), requestType: "mileage" })))
    .returning();
  const rateFor = (date: string) =>
    [...rateRows].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).find((r) => r.effectiveFrom <= date)!;

  await tx.insert(s.settings).values(DEFAULT_SETTINGS.map((x) => ({ ...x, value: x.value as object })));

  // People -------------------------------------------------------------------------------------
  // Sign-in accounts for everyone who has signed in before, with their email and phone.
  for (const key of Object.keys(DEMO) as PersonKey[]) {
    const userId = DEMO[key].userId;
    const person = PEOPLE.find((p) => p.key === key);
    if (!userId) continue;
    if (person) {
      await tx.execute(
        sql`insert into auth.users (id, email, phone) values (${userId}::uuid, ${person.email}, ${person.phone?.slice(1) ?? null})`,
      );
    } else {
      await tx.execute(sql`insert into auth.users (id, email) values (${userId}::uuid, ${NORA_EMAIL})`);
    }
  }
  for (const p of PEOPLE) {
    await tx.insert(s.staff).values({
      id: DEMO[p.key].staffId!,
      userId: DEMO[p.key].userId,
      fullName: p.name,
      source: p.key === "felix" || p.key === "eden" ? "roster" : "seed",
      defaultSiteId: siteId(p.site),
    });
    await tx.insert(s.staffPrivate).values({ staffId: DEMO[p.key].staffId!, email: p.email, phoneE164: p.phone ?? null });
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
    id: nextId(),
    userId: DEMO.nora.userId,
    fullName: "Nora Pennington",
    email: NORA_EMAIL,
    createdAt: tsDaysAgo(1, 16, 20),
  });

  // Places -------------------------------------------------------------------------------------
  const placeRows = await tx
    .insert(s.savedPlaces)
    .values(PLACES.map(({ label, address, lat, lng }) => ({ id: nextId(), label, address, lat, lng })))
    .returning();
  const place = (key: Exclude<PlaceKey, "home">) => {
    const def = PLACES.find((p) => p.key === key)!;
    return { ...placeRows.find((r) => r.label === def.label)!, isHome: false };
  };
  const homes: Partial<Record<PersonKey, typeof s.savedPlaces.$inferSelect>> = {};
  for (const [key, home] of Object.entries(HOMES) as [PersonKey, (typeof HOMES)[PersonKey]][]) {
    const [row] = await tx
      .insert(s.savedPlaces)
      .values({ id: nextId(), ownerId: DEMO[key].staffId, label: "Home", isHome: true, ...home! })
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
    /** Direct (with students) unless said otherwise. */
    costType?: "direct" | "indirect";
    parking?: number;
    site?: string;
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
        id: nextId(),
        requestType: "mileage",
        ownerId: DEMO[t.owner].staffId!,
        requestId,
        itemDate: date,
        purpose: t.purpose,
        siteId: siteId(t.site ?? owner.site),
        costType: t.costType ?? "direct",
        notes: t.notes ?? null,
        amountCents: mileageAmountCents(miles, rate.rateCents) + (t.parking ?? 0),
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
      parkingCents: t.parking ?? 0,
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

  /** A claim of `type` with its history. Its items are added after. */
  async function addRequest(type: "mileage" | "phone", owner: PersonKey, steps: Step[], note?: string) {
    const last = steps[steps.length - 1];
    const submitted = [...steps].reverse().find((x) => x.action === "submitted" || x.action === "resubmitted");
    const decided = [...steps].reverse().find((x) => ["approved", "returned", "denied"].includes(x.action));
    const [req] = await tx
      .insert(s.requests)
      .values({
        id: nextId(),
        requestType: type,
        ownerId: DEMO[owner].staffId!,
        status: last.to,
        employeeNote: note ?? null,
        submittedAt: submitted ? tsDaysAgo(submitted.daysAgo, 17, 5) : null,
        decidedAt: decided ? tsDaysAgo(decided.daysAgo, 9, 40) : null,
        decidedBy: decided ? DEMO[decided.by].staffId : null,
        createdAt: tsDaysAgo(steps[0].daysAgo, 17),
      })
      .returning();
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

  async function addClaim(owner: PersonKey, trips: Omit<TripSpec, "owner">[], steps: Step[], note?: string) {
    const id = await addRequest("mileage", owner, steps, note);
    for (const t of trips) await addTrip({ ...t, owner }, id);
    return id;
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
      { daysAgo: 5, route: ["office", "county"], roundTrip: true, purpose: "Quarterly grant meeting", costType: "indirect", parking: 600 },
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
      { daysAgo: 42, route: ["office", "willow"], roundTrip: true, purpose: "Staff training at Willow Creek", costType: "indirect" },
    ],
    [
      { action: "submitted", by: "rowan", daysAgo: 40, to: "submitted" },
      { action: "approved", by: "lena", daysAgo: 38, to: "approved" },
      { action: "batched", by: "hazel", daysAgo: 33, to: "batched", comment: "Added to batch B-101" },
      { action: "paid", by: "hazel", daysAgo: 30, to: "paid", comment: "Paid in batch B-101" },
    ],
  );

  // Tessa: a returned claim to fix, a claim in the open batch, one trip not yet submitted.
  await addTrip({ owner: "tessa", daysAgo: 1, route: ["office", "delta"], roundTrip: true, purpose: "Community partner meeting", costType: "indirect" }, null);
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
      { daysAgo: 17, route: ["office", "county"], roundTrip: true, purpose: "Compliance training", costType: "indirect", parking: 800 },
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
      { daysAgo: 29, route: ["home", "office"], purpose: "Office day", costType: "indirect" },
      { daysAgo: 28, route: ["home", "office"], purpose: "Office day", costType: "indirect" },
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
    [{ daysAgo: 12, route: ["office", "county"], roundTrip: true, purpose: "Workforce board meeting", costType: "indirect", parking: 500 }],
    [
      { action: "submitted", by: "owen", daysAgo: 11, to: "submitted" },
      { action: "approved", by: "sam", daysAgo: 10, to: "approved" },
    ],
  );

  // Hazel (finance) has a paid claim in the same batch as Rowan's.
  const hazelPaid = await addClaim(
    "hazel",
    [{ daysAgo: 41, route: ["office", "county"], roundTrip: true, purpose: "Audit prep meeting", costType: "indirect" }],
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
      id: nextId(),
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
      id: nextId(),
      periodStart: isoDaysAgo(17),
      periodEnd: isoDaysAgo(4),
      status: "open",
      createdBy: DEMO.hazel.staffId,
      createdAt: tsDaysAgo(2, 11),
    })
    .returning();
  // Phone bills -------------------------------------------------------------------------------
  const [phoneRate] = await tx
    .insert(s.rates)
    .values({
      id: nextId(),
      requestType: "phone",
      rateCents: "4500.00",
      effectiveFrom: "2025-01-01",
      note: "$45 a month for using a personal phone for work.",
    })
    .returning();

  async function addPhoneMonths(owner: PersonKey, requestId: string, months: string[], daysAgo: number) {
    const person = PEOPLE.find((p) => p.key === owner)!;
    for (const month of months) {
      const [item] = await tx
        .insert(s.requestItems)
        .values({
          id: nextId(),
          requestType: "phone",
          ownerId: DEMO[owner].staffId!,
          requestId,
          itemDate: month,
          purpose: `Phone bill, ${formatMonth(month)}`,
          siteId: siteId(person.site),
          amountCents: phoneAmountCents(phoneRate.rateCents),
          createdAt: tsDaysAgo(daysAgo, 17),
        })
        .returning();
      await tx.insert(s.phoneDetails).values({ itemId: item.id, ownerId: DEMO[owner].staffId!, month, rateId: phoneRate.id, rateCents: phoneRate.rateCents });
    }
    // Phone bill claims need a copy of the bill: a made-up one.
    const bill = fakeBillPdf([
      "SAMPLE WIRELESS - FAKE DEMO BILL",
      `Account holder: ${person.name}`,
      `Billing period: ${formatMonths(months)}`,
      "Wireless service and data: $68.40 a month",
      "Not a real bill. Made up for the SCCSC demo.",
    ]);
    await tx.insert(s.requestAttachments).values({
      id: nextId(),
      requestId,
      ownerId: DEMO[owner].staffId!,
      fileName: `phone-bill-${months[0].slice(0, 7)}.pdf`,
      contentType: "application/pdf",
      sizeBytes: bill.length,
      data: bill,
      createdAt: tsDaysAgo(daysAgo, 17),
    });
  }

  // Claim periods are calendar months, so they're worked out from today (2 months per claim). If
  // the latest period opened in the last few days, the demo claims use the one before it, so each
  // claim's history has room. Rowan leaves the latest period unclaimed, to show "ready to claim".
  const today = todayIso();
  const daysSince = (iso: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000);
  const latest = latestOpenPeriod(today, 2);
  const shown: Period = daysSince(latest.opens) >= 4 ? latest : periodOf(addMonths(latest.start, -1), 2);
  const earlier = periodOf(addMonths(shown.start, -1), 2);
  const open = daysSince(shown.opens);
  const decidedAgo = Math.max(0, Math.floor((open - 1) / 2));

  // Tessa: waiting for Lena.
  const tessaPhone = await addRequest("phone", "tessa", [{ action: "submitted", by: "tessa", daysAgo: decidedAgo, to: "submitted" }]);
  await addPhoneMonths("tessa", tessaPhone, shown.months, decidedAgo);
  // Marcus: approved by Owen, ready for finance.
  const marcusPhone = await addRequest("phone", "marcus", [
    { action: "submitted", by: "marcus", daysAgo: open - 1, to: "submitted" },
    { action: "approved", by: "owen", daysAgo: decidedAgo, to: "approved" },
  ]);
  await addPhoneMonths("marcus", marcusPhone, shown.months, open - 1);
  // Lena: returned by Owen, to take out a month.
  const [firstMonth, secondMonth] = shown.months.map((m) => formatMonth(m, { withYear: false }));
  const lenaPhone = await addRequest("phone", "lena", [
    { action: "submitted", by: "lena", daysAgo: open - 1, to: "submitted" },
    {
      action: "returned",
      by: "owen",
      daysAgo: decidedAgo,
      to: "returned",
      comment: `You were on leave in ${firstMonth}, so please take ${firstMonth} out and resubmit for ${secondMonth} only.`,
    },
  ]);
  await addPhoneMonths("lena", lenaPhone, shown.months, open - 1);
  // Rowan: the period before was paid in batch B-101, with his mileage.
  const earlierOpen = daysSince(earlier.opens);
  const rowanPhone = await addRequest("phone", "rowan", [
    { action: "submitted", by: "rowan", daysAgo: earlierOpen - 2, to: "submitted" },
    { action: "approved", by: "lena", daysAgo: earlierOpen - 4, to: "approved" },
    { action: "batched", by: "hazel", daysAgo: 33, to: "batched", comment: "Added to batch B-101" },
    { action: "paid", by: "hazel", daysAgo: 30, to: "paid", comment: "Paid in batch B-101" },
  ]);
  await addPhoneMonths("rowan", rowanPhone, earlier.months, earlierOpen - 2);

  await tx.execute(
    sql`update public.requests set batch_id = ${paidBatch.id}::uuid where id in (${rowanPaid}::uuid, ${hazelPaid}::uuid, ${rowanPhone}::uuid)`,
  );
  await tx.execute(sql`update public.requests set batch_id = ${openBatch.id}::uuid where id = ${tessaBatched}::uuid`);
  await tx.execute(
    sql`update public.batches b set total_cents = coalesce((select sum(r.total_cents) from public.requests r where r.batch_id = b.id), 0)`,
  );
}
