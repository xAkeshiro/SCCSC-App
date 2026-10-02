import "server-only";

import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "@/db";
import { adminEvents, sites, staff, staffPrivate, staffRoles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Role, Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import { plural } from "@/lib/format";
import { nameKey } from "@/lib/names";
import { ROLE_LABEL } from "@/lib/roles";
import { siteLabel } from "@/lib/sites";
import { ALL_ROLES, type StaffInput } from "@/lib/staff";
import { logAdmin } from "./admin-log";
import { siteGroups } from "./sites";

export type StaffShow = "active" | "inactive" | "all";

/** The staff list for admins: everyone, with roles, reviewer, usual site and contact details. */
export async function staffDirectory(viewer: Viewer, f: { q: string; show: StaffShow }) {
  return withUser(viewer.userId, async (tx) => {
    const reviewer = alias(staff, "reviewer");
    const people = await tx
      .select({
        id: staff.id,
        fullName: staff.fullName,
        status: staff.status,
        signedIn: staff.userId,
        aplosName: staff.aplosName,
        coordinatorId: staff.coordinatorId,
        coordinatorName: reviewer.fullName,
        siteCode: sites.code,
        siteName: sites.name,
        email: staffPrivate.email,
        phone: staffPrivate.phoneE164,
      })
      .from(staff)
      .leftJoin(reviewer, eq(reviewer.id, staff.coordinatorId))
      .leftJoin(sites, eq(sites.id, staff.defaultSiteId))
      .leftJoin(staffPrivate, eq(staffPrivate.staffId, staff.id))
      .orderBy(asc(staff.fullName));
    const roles = await tx.select().from(staffRoles);
    const all = people.map((p) => ({
      ...p,
      signedIn: p.signedIn !== null,
      roles: ALL_ROLES.filter((r) => roles.some((x) => x.staffId === p.id && x.role === r)),
      teamSize: people.filter((x) => x.coordinatorId === p.id && x.status === "active").length,
    }));

    const q = f.q.trim().toLowerCase();
    const key = nameKey(q);
    const digits = q.replace(/\D/g, "");
    const matches = (p: (typeof all)[number]) =>
      !q ||
      (key && nameKey(p.fullName).includes(key)) ||
      (key && p.aplosName && nameKey(p.aplosName).includes(key)) ||
      (p.email?.includes(q) ?? false) ||
      (digits.length >= 4 && (p.phone?.includes(digits) ?? false));
    const active = all.filter((p) => p.status === "active");
    const withRole = (r: Role) => active.filter((p) => p.roles.includes(r)).length;
    return {
      people: all.filter((p) => (f.show === "all" || p.status === f.show) && matches(p)),
      counts: {
        active: active.length,
        inactive: all.length - active.length,
        coordinator: withRole("coordinator"),
        finance: withRole("finance"),
        admin: withRole("admin"),
        notSignedIn: active.filter((p) => !p.signedIn).length,
      },
    };
  });
}

async function loadPerson(tx: Tx, id: string) {
  const [person] = await tx
    .select({
      id: staff.id,
      fullName: staff.fullName,
      status: staff.status,
      source: staff.source,
      userId: staff.userId,
      coordinatorId: staff.coordinatorId,
      defaultSiteId: staff.defaultSiteId,
      aplosName: staff.aplosName,
      createdAt: staff.createdAt,
      email: staffPrivate.email,
      phone: staffPrivate.phoneE164,
    })
    .from(staff)
    .leftJoin(staffPrivate, eq(staffPrivate.staffId, staff.id))
    .where(eq(staff.id, id))
    .limit(1);
  if (!person) return null;
  const roles = await tx.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.staffId, id));
  return { ...person, roles: ALL_ROLES.filter((r) => roles.some((x) => x.role === r)) };
}

async function activeCoordinators(tx: Tx) {
  const ids = (await tx.select({ id: staffRoles.staffId }).from(staffRoles).where(eq(staffRoles.role, "coordinator"))).map((r) => r.id);
  if (ids.length === 0) return [];
  return tx
    .select({ id: staff.id, fullName: staff.fullName })
    .from(staff)
    .where(and(inArray(staff.id, ids), eq(staff.status, "active")))
    .orderBy(asc(staff.fullName));
}

async function teamOf(tx: Tx, id: string) {
  return tx
    .select({ id: staff.id, fullName: staff.fullName })
    .from(staff)
    .where(and(eq(staff.coordinatorId, id), eq(staff.status, "active")))
    .orderBy(asc(staff.fullName));
}

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Everything the add or edit form needs. Null when `id` isn't a staff member. */
export async function staffEditor(viewer: Viewer, id: string | null) {
  if (id !== null && !isUuid(id)) return null;
  return withUser(viewer.userId, async (tx) => {
    const person = id ? await loadPerson(tx, id) : null;
    if (id && !person) return null;
    return {
      person,
      team: id ? await teamOf(tx, id) : [],
      coordinators: (await activeCoordinators(tx)).filter((c) => c.id !== id),
      siteGroups: await siteGroups(tx, person?.defaultSiteId),
      history: id ? await tx.select().from(adminEvents).where(eq(adminEvents.staffId, id)).orderBy(desc(adminEvents.id)).limit(10) : [],
    };
  });
}

export async function saveStaff(viewer: Viewer, id: string | null, input: StaffInput) {
  return withUser(viewer.userId, (tx) => saveStaffTx(tx, viewer.staffId, id, input));
}

/**
 * Adds a person or saves changes to one, and records what changed in the admin history.
 * Returns the person's id and the list of changes (empty when nothing changed).
 */
export async function saveStaffTx(tx: Tx, actorId: string, id: string | null, input: StaffInput) {
  const before = id ? await loadPerson(tx, id) : null;
  if (id && !before) throw new UserError("That person isn't on the staff list.");

  // Don't let an admin lock themselves out.
  if (id === actorId && !input.roles.includes("admin")) throw new UserError("You can't remove your own Admin role. Ask another admin to do it.");
  if (id === actorId && !input.active) throw new UserError("You can't make yourself inactive. Ask another admin to do it.");

  let reviewerName: string | null = null;
  if (input.coordinatorId) {
    if (input.coordinatorId === id) throw new UserError("Nobody reviews their own claims. Choose someone else, or no reviewer.");
    const reviewer = (await activeCoordinators(tx)).find((c) => c.id === input.coordinatorId);
    if (!reviewer) throw new UserError("Their reviewer must be an active coordinator.");
    reviewerName = reviewer.fullName;
  }

  if (before) {
    const team = await teamOf(tx, before.id);
    if (team.length && (!input.roles.includes("coordinator") || !input.active)) {
      throw new UserError(`${before.fullName} reviews ${plural(team.length, "person", "people")}. Move them to another reviewer first, under "Their team".`);
    }
  }

  for (const [column, value, word] of [
    [staffPrivate.email, input.email, "email"],
    [staffPrivate.phoneE164, input.phone, "mobile number"],
  ] as const) {
    if (!value) continue;
    const [other] = await tx
      .select({ name: staff.fullName })
      .from(staffPrivate)
      .innerJoin(staff, eq(staff.id, staffPrivate.staffId))
      .where(and(eq(column, value), id ? ne(staffPrivate.staffId, id) : undefined))
      .limit(1);
    if (other) throw new UserError(`That ${word} is already on ${other.name}'s record.`);
  }

  // A hidden school or site can stay as someone's usual one, but not be newly chosen.
  const [site] = input.siteId
    ? await tx
        .select({ id: sites.id, code: sites.code, name: sites.name })
        .from(sites)
        .where(and(eq(sites.id, input.siteId), or(eq(sites.active, true), before?.defaultSiteId ? eq(sites.id, before.defaultSiteId) : undefined)))
        .limit(1)
    : [];
  const siteId = site?.id ?? null;
  const status = input.active ? "active" : "inactive";
  const roleNames = (roles: Role[]) => roles.map((r) => ROLE_LABEL[r]).join(", ");

  if (!before) {
    const [created] = await tx
      .insert(staff)
      .values({ fullName: input.fullName, status, source: "roster", coordinatorId: input.coordinatorId, defaultSiteId: siteId, aplosName: input.aplosName })
      .returning({ id: staff.id });
    await tx.insert(staffPrivate).values({ staffId: created.id, email: input.email, phoneE164: input.phone });
    await tx.insert(staffRoles).values(input.roles.map((role) => ({ staffId: created.id, role })));
    const summary = `Added ${input.fullName} (${roleNames(input.roles)})`;
    await logAdmin(tx, "staff", summary, created.id);
    return { staffId: created.id, changes: [summary] };
  }

  const siteName = async (siteIdValue: string | null) => {
    if (!siteIdValue) return "none";
    const [s] = await tx.select({ code: sites.code, name: sites.name }).from(sites).where(eq(sites.id, siteIdValue)).limit(1);
    return s ? siteLabel(s) : "none";
  };
  const nameOf = async (staffId: string | null) => {
    if (!staffId) return "none (an admin reviews)";
    const [s] = await tx.select({ fullName: staff.fullName }).from(staff).where(eq(staff.id, staffId)).limit(1);
    return s?.fullName ?? "none";
  };
  const changes: string[] = [];
  if (before.fullName !== input.fullName) changes.push(`Name: ${before.fullName} → ${input.fullName}`);
  if (before.email !== input.email) changes.push(input.email ? (before.email ? "Changed the email" : "Added an email") : "Removed the email");
  if (before.phone !== input.phone) changes.push(input.phone ? (before.phone ? "Changed the mobile number" : "Added a mobile number") : "Removed the mobile number");
  const added = input.roles.filter((r) => !before.roles.includes(r));
  const removed = before.roles.filter((r) => !input.roles.includes(r));
  if (added.length || removed.length) {
    const parts = [added.length ? `added ${roleNames(added)}` : null, removed.length ? `removed ${roleNames(removed)}` : null];
    changes.push(`Roles: ${parts.filter(Boolean).join("; ")}`);
  }
  if (before.coordinatorId !== input.coordinatorId) changes.push(`Reviewer: ${await nameOf(before.coordinatorId)} → ${reviewerName ?? (await nameOf(null))}`);
  if (before.defaultSiteId !== siteId) changes.push(`Usual school or site: ${await siteName(before.defaultSiteId)} → ${site ? siteLabel(site) : "none"}`);
  if ((before.aplosName ?? null) !== input.aplosName) changes.push(input.aplosName ? `Name in Aplos: ${input.aplosName}` : "Name in Aplos: same as their name");
  if (before.status !== status) changes.push(input.active ? "Made active again" : "Made inactive (can't sign in)");
  if (changes.length === 0) return { staffId: before.id, changes };

  await tx
    .update(staff)
    .set({ fullName: input.fullName, status, coordinatorId: input.coordinatorId, defaultSiteId: siteId, aplosName: input.aplosName, updatedAt: new Date() })
    .where(eq(staff.id, before.id));
  if (before.email !== input.email || before.phone !== input.phone) {
    await tx
      .insert(staffPrivate)
      .values({ staffId: before.id, email: input.email, phoneE164: input.phone })
      .onConflictDoUpdate({ target: staffPrivate.staffId, set: { email: input.email, phoneE164: input.phone, updatedAt: new Date() } });
  }
  if (added.length) await tx.insert(staffRoles).values(added.map((role) => ({ staffId: before.id, role })));
  if (removed.length) await tx.delete(staffRoles).where(and(eq(staffRoles.staffId, before.id), inArray(staffRoles.role, removed)));
  await logAdmin(tx, "staff", `${input.fullName}: ${changes.join(". ")}`, before.id);
  return { staffId: before.id, changes };
}

/** Moves everyone `fromId` reviews to another coordinator (or to no reviewer, so an admin reviews). */
export async function moveTeam(viewer: Viewer, fromId: string, toId: string | null) {
  if (!isUuid(fromId) || (toId !== null && !isUuid(toId))) throw new UserError("Choose who reviews them now.");
  return withUser(viewer.userId, async (tx) => {
    const from = await loadPerson(tx, fromId);
    if (!from) throw new UserError("That person isn't on the staff list.");
    let toName = "no reviewer (an admin reviews)";
    if (toId) {
      if (toId === fromId) throw new UserError("Choose someone else.");
      const to = (await activeCoordinators(tx)).find((c) => c.id === toId);
      if (!to) throw new UserError("The new reviewer must be an active coordinator.");
      toName = to.fullName;
    }
    // Someone on the team can't become their own reviewer: they keep the current one.
    const moved = await tx
      .update(staff)
      .set({ coordinatorId: toId, updatedAt: new Date() })
      .where(and(eq(staff.coordinatorId, fromId), eq(staff.status, "active"), toId ? ne(staff.id, toId) : undefined))
      .returning({ id: staff.id });
    if (moved.length === 0) throw new UserError("There was nobody to move.");
    await logAdmin(tx, "staff", `Moved ${plural(moved.length, "person", "people")} from ${from.fullName} to ${toName}`, fromId);
    return moved.length;
  });
}
