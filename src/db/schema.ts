/**
 * Tables for the staff app. Drizzle generates the table SQL from this file (`npm run db:generate`).
 * Row Level Security, helper functions, status transitions and triggers are hand-written in
 * drizzle/0001_security.sql. See docs/ARCHITECTURE.md for the reasoning.
 *
 * Conventions:
 * - Money is integer cents. Rates are exact decimals (numeric) in cents per unit.
 * - Miles are numeric(7,1): one decimal place, like an odometer.
 * - Every status change on a request goes through app.transition functions, which write
 *   request_events (the audit trail).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// ---------------------------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------------------------

export const staffStatus = pgEnum("staff_status", ["active", "inactive"]);
export const staffSource = pgEnum("staff_source", ["roster", "request", "seed"]);
export const appRole = pgEnum("app_role", ["employee", "coordinator", "finance", "admin"]);
export const accessRequestStatus = pgEnum("access_request_status", ["pending", "approved", "rejected"]);
export const requestStatus = pgEnum("request_status", [
  "draft",
  "submitted",
  "returned",
  "approved",
  "denied",
  "batched",
  "paid",
]);
export const requestAction = pgEnum("request_action", [
  "submitted",
  "withdrawn",
  "resubmitted",
  "approved",
  "returned",
  "denied",
  "batched",
  "unbatched",
  "paid",
]);
export const batchStatus = pgEnum("batch_status", ["open", "exported", "paid"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

/** A staff member. Created by roster import, by approving an access request, or by the demo seed. */
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The sign-in account (Supabase auth user). Null until the person signs in the first time. */
    userId: uuid("user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    status: staffStatus("status").notNull().default("active"),
    source: staffSource("source").notNull(),
    /** Who approves this person's requests. */
    coordinatorId: uuid("coordinator_id").references((): AnyPgColumn => staff.id, { onDelete: "set null" }),
    defaultProgramId: uuid("default_program_id").references(() => programs.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("staff_coordinator_idx").on(t.coordinatorId)],
);

/**
 * Personal contact details, readable by admins only. Sign-ins are matched against the roster by
 * email (the default) or mobile number, plus the name.
 */
export const staffPrivate = pgTable(
  "staff_private",
  {
    staffId: uuid("staff_id")
      .primaryKey()
      .references(() => staff.id, { onDelete: "cascade" }),
    /** E.164, e.g. +19165550101. */
    phoneE164: text("phone_e164").unique(),
    /** Lowercase, e.g. rowan.ellery@example.org. */
    email: text("email").unique(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("staff_private_contact", sql`${t.phoneE164} is not null or ${t.email} is not null`),
    check("staff_private_email_lower", sql`${t.email} = lower(${t.email})`),
  ],
);

export const staffRoles = pgTable(
  "staff_roles",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    role: appRole("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.role] })],
);

/** Small per-person state the person may update themselves. */
export const staffState = pgTable("staff_state", {
  staffId: uuid("staff_id")
    .primaryKey()
    .references(() => staff.id, { onDelete: "cascade" }),
  updatesSeenAt: timestamp("updates_seen_at", { withTimezone: true }),
});

/**
 * Someone verified their email or phone but did not match the roster (or their name differed).
 * An admin checks them against payroll and approves or rejects.
 */
export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    /** The email or phone they signed in with (one of the two). */
    phoneE164: text("phone_e164"),
    email: text("email"),
    /** A roster entry with the same email or phone but a different name, if any. */
    matchedStaffId: uuid("matched_staff_id").references(() => staff.id, { onDelete: "set null" }),
    status: accessRequestStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => staff.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("access_requests_status_idx").on(t.status),
    check("access_requests_contact", sql`${t.phoneE164} is not null or ${t.email} is not null`),
  ],
);

// ---------------------------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------------------------

/** Program or grant codes that trips are charged to. */
export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Kinds of request. Mileage first; other reimbursements are added as new rows + a module in code. */
export const requestTypes = pgTable("request_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
});

/** Effective-dated reimbursement rates. The rate in force on a trip's date applies. */
export const rates = pgTable(
  "rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestType: text("request_type")
      .notNull()
      .references(() => requestTypes.id),
    /** Cents per unit (per mile for mileage), e.g. 72.50. */
    rateCents: numeric("rate_cents", { precision: 7, scale: 2 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    createdBy: uuid("created_by").references(() => staff.id, { onDelete: "set null" }),
  },
  (t) => [unique("rates_type_effective_unique").on(t.requestType, t.effectiveFrom), check("rates_positive", sql`${t.rateCents} > 0`)],
);

/** Business rules that are still open questions live here, so they can change without a deploy. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: updatedAt(),
  updatedBy: uuid("updated_by").references(() => staff.id, { onDelete: "set null" }),
});

/** Frequent places. owner_id null = shared with everyone (main office, school sites). */
export const savedPlaces = pgTable(
  "saved_places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => staff.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    address: text("address").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    isHome: boolean("is_home").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("saved_places_owner_idx").on(t.ownerId)],
);

// ---------------------------------------------------------------------------------------------
// Requests (claims) and their items (trips)
// ---------------------------------------------------------------------------------------------

export const batches = pgTable("batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Human-friendly number shown as B-101. */
  ref: bigint("ref", { mode: "number" }).generatedAlwaysAsIdentity({ startWith: 101 }).notNull().unique(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: batchStatus("status").notNull().default("open"),
  totalCents: integer("total_cents").notNull().default(0),
  note: text("note"),
  createdBy: uuid("created_by").references(() => staff.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  exportedBy: uuid("exported_by").references(() => staff.id, { onDelete: "set null" }),
  paidOn: date("paid_on"),
  paidBy: uuid("paid_by").references(() => staff.id, { onDelete: "set null" }),
});

/** A claim: a bundle of items submitted together for approval. */
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-friendly number shown as M-1001. */
    ref: bigint("ref", { mode: "number" }).generatedAlwaysAsIdentity({ startWith: 1001 }).notNull().unique(),
    requestType: text("request_type")
      .notNull()
      .references(() => requestTypes.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => staff.id),
    status: requestStatus("status").notNull().default("draft"),
    /** Kept in sync with the items by a trigger. */
    totalCents: integer("total_cents").notNull().default(0),
    employeeNote: text("employee_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => staff.id, { onDelete: "set null" }),
    batchId: uuid("batch_id").references(() => batches.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("requests_owner_idx").on(t.ownerId),
    index("requests_status_idx").on(t.status),
    index("requests_batch_idx").on(t.batchId),
  ],
);

/** One line of a request. For mileage, one trip (details in mileage_details). */
export const requestItems = pgTable(
  "request_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestType: text("request_type")
      .notNull()
      .references(() => requestTypes.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => staff.id),
    /** Null while the item is not yet part of a claim. */
    requestId: uuid("request_id").references(() => requests.id, { onDelete: "set null" }),
    itemDate: date("item_date").notNull(),
    purpose: text("purpose").notNull(),
    programId: uuid("program_id").references(() => programs.id),
    notes: text("notes"),
    amountCents: integer("amount_cents").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("request_items_owner_idx").on(t.ownerId),
    index("request_items_request_idx").on(t.requestId),
    check("request_items_amount_nonnegative", sql`${t.amountCents} >= 0`),
  ],
);

export type Stop = { label: string; address: string | null; placeId: string | null; isHome: boolean };

/** Mileage-specific fields of a trip. */
export const mileageDetails = pgTable(
  "mileage_details",
  {
    itemId: uuid("item_id")
      .primaryKey()
      .references(() => requestItems.id, { onDelete: "cascade" }),
    fromPlaceId: uuid("from_place_id").references(() => savedPlaces.id, { onDelete: "set null" }),
    fromLabel: text("from_label").notNull(),
    fromAddress: text("from_address"),
    fromIsHome: boolean("from_is_home").notNull().default(false),
    toPlaceId: uuid("to_place_id").references(() => savedPlaces.id, { onDelete: "set null" }),
    toLabel: text("to_label").notNull(),
    toAddress: text("to_address"),
    toIsHome: boolean("to_is_home").notNull().default(false),
    /** Extra stops in order, between from and to. */
    stops: jsonb("stops").$type<Stop[]>().notNull().default(sql`'[]'::jsonb`),
    roundTrip: boolean("round_trip").notNull().default(false),
    /** What the distance service calculated, if it could. */
    milesEstimated: numeric("miles_estimated", { precision: 7, scale: 1 }),
    /** Miles claimed (includes the return leg for round trips). */
    miles: numeric("miles", { precision: 7, scale: 1 }).notNull(),
    /** Required when the claimed miles differ from the estimate. */
    overrideReason: text("override_reason"),
    /** The rate this trip was calculated with (copied, so later rate changes don't alter it). */
    rateId: uuid("rate_id").references(() => rates.id),
    rateCents: numeric("rate_cents", { precision: 7, scale: 2 }).notNull(),
  },
  (t) => [
    check("mileage_miles_positive", sql`${t.miles} > 0`),
    check(
      "mileage_override_needs_reason",
      sql`${t.milesEstimated} is null or ${t.miles} = ${t.milesEstimated} or coalesce(btrim(${t.overrideReason}), '') <> ''`,
    ),
  ],
);

/** Audit trail: every status change, who made it, when, and why. Never updated or deleted. */
export const requestEvents = pgTable(
  "request_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => staff.id, { onDelete: "set null" }),
    /** The actor's name at the time, so the record reads correctly even if the person leaves. */
    actorName: text("actor_name").notNull(),
    action: requestAction("action").notNull(),
    fromStatus: requestStatus("from_status"),
    toStatus: requestStatus("to_status").notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [index("request_events_request_idx").on(t.requestId, t.createdAt)],
);

// ---------------------------------------------------------------------------------------------
// Views (defined in drizzle/0001_security.sql; declared here only for typed queries)
// ---------------------------------------------------------------------------------------------

/** Trips joined with their mileage details. Hides home addresses from anyone but the owner. */
export const tripView = pgView("trip_view", {
  id: uuid("id").notNull(),
  ownerId: uuid("owner_id").notNull(),
  requestId: uuid("request_id"),
  itemDate: date("item_date").notNull(),
  purpose: text("purpose").notNull(),
  programId: uuid("program_id"),
  notes: text("notes"),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  fromPlaceId: uuid("from_place_id"),
  fromLabel: text("from_label").notNull(),
  fromAddress: text("from_address"),
  fromIsHome: boolean("from_is_home").notNull(),
  toPlaceId: uuid("to_place_id"),
  toLabel: text("to_label").notNull(),
  toAddress: text("to_address"),
  toIsHome: boolean("to_is_home").notNull(),
  stops: jsonb("stops").$type<Stop[]>().notNull(),
  roundTrip: boolean("round_trip").notNull(),
  milesEstimated: numeric("miles_estimated", { precision: 7, scale: 1 }),
  miles: numeric("miles", { precision: 7, scale: 1 }).notNull(),
  overrideReason: text("override_reason"),
  rateId: uuid("rate_id"),
  rateCents: numeric("rate_cents", { precision: 7, scale: 2 }).notNull(),
  involvesHome: boolean("involves_home").notNull(),
}).existing();
