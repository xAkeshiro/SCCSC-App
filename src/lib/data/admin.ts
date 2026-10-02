import "server-only";

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { accessRequests, staff, staffPrivate, staffRoles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Role, Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import { cleanName } from "@/lib/names";
import { findActiveSite, siteGroups } from "./sites";

export const ALL_ROLES: Role[] = ["employee", "coordinator", "finance", "admin"];

export async function adminOverview(viewer: Viewer) {
  return withUser(viewer.userId, async (tx) => {
    const people = await tx
      .select({
        id: staff.id,
        fullName: staff.fullName,
        status: staff.status,
        userId: staff.userId,
        coordinatorId: staff.coordinatorId,
        source: staff.source,
        phone: staffPrivate.phoneE164,
        email: staffPrivate.email,
      })
      .from(staff)
      .leftJoin(staffPrivate, eq(staffPrivate.staffId, staff.id))
      .orderBy(asc(staff.fullName));
    const roles = await tx.select().from(staffRoles);
    const requests = await tx.select().from(accessRequests).orderBy(desc(accessRequests.createdAt));

    const staffWithRoles = people.map((p) => ({
      ...p,
      roles: ALL_ROLES.filter((r) => roles.some((x) => x.staffId === p.id && x.role === r)),
    }));
    const byId = new Map(staffWithRoles.map((p) => [p.id, p]));
    return {
      staff: staffWithRoles.map((p) => ({ ...p, coordinatorName: p.coordinatorId ? (byId.get(p.coordinatorId)?.fullName ?? null) : null })),
      coordinators: staffWithRoles.filter((p) => p.status === "active" && p.roles.includes("coordinator")),
      pending: requests
        .filter((r) => r.status === "pending")
        .map((r) => ({ ...r, matched: r.matchedStaffId ? (byId.get(r.matchedStaffId) ?? null) : null })),
      reviewed: requests
        .filter((r) => r.status !== "pending")
        .slice(0, 8)
        .map((r) => ({ ...r, reviewerName: r.reviewedBy ? (byId.get(r.reviewedBy)?.fullName ?? null) : null })),
      siteGroups: await siteGroups(tx),
    };
  });
}

export type ApproveInput = {
  requestId: string;
  fullName: string;
  roles: Role[];
  coordinatorId: string | null;
  siteId: string | null;
};

/** Approves an access request: links the roster entry with the same email or phone, or adds a new staff member. */
export async function approveAccessRequest(viewer: Viewer, input: ApproveInput) {
  return withUser(viewer.userId, async (tx) => {
    const [req] = await tx
      .select()
      .from(accessRequests)
      .where(and(eq(accessRequests.id, input.requestId), eq(accessRequests.status, "pending")))
      .limit(1);
    if (!req) throw new UserError("This request was already handled.");

    let staffId: string;
    const [sameContact] = await tx
      .select()
      .from(staffPrivate)
      .where(req.email ? eq(staffPrivate.email, req.email) : eq(staffPrivate.phoneE164, req.phoneE164!))
      .limit(1);
    if (sameContact) {
      // The email or phone is on the roster (the name typed didn't match exactly): link to that person.
      const [linked] = await tx
        .update(staff)
        .set({ userId: req.userId, coordinatorId: input.coordinatorId, defaultSiteId: (await findActiveSite(tx, input.siteId))?.id ?? null, status: "active", updatedAt: new Date() })
        .where(and(eq(staff.id, sameContact.staffId), isNull(staff.userId)))
        .returning({ id: staff.id });
      if (!linked) {
        throw new UserError(`That ${req.email ? "email" : "phone number"} already belongs to someone who has signed in.`);
      }
      staffId = linked.id;
      await tx.delete(staffRoles).where(eq(staffRoles.staffId, staffId));
    } else {
      const [created] = await tx
        .insert(staff)
        .values({
          userId: req.userId,
          fullName: cleanName(input.fullName) || req.fullName,
          source: "request",
          coordinatorId: input.coordinatorId,
          defaultSiteId: (await findActiveSite(tx, input.siteId))?.id ?? null,
        })
        .returning({ id: staff.id });
      staffId = created.id;
      await tx.insert(staffPrivate).values({ staffId, phoneE164: req.phoneE164, email: req.email });
    }
    await tx.insert(staffRoles).values(input.roles.map((role) => ({ staffId, role })));
    await tx
      .update(accessRequests)
      .set({ status: "approved", reviewedBy: viewer.staffId, reviewedAt: new Date(), matchedStaffId: sameContact?.staffId ?? null })
      .where(eq(accessRequests.id, req.id));
    return staffId;
  });
}

export async function rejectAccessRequest(viewer: Viewer, requestId: string, note: string) {
  return withUser(viewer.userId, async (tx) => {
    const [done] = await tx
      .update(accessRequests)
      .set({ status: "rejected", reviewedBy: viewer.staffId, reviewedAt: new Date(), reviewNote: note })
      .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, "pending")))
      .returning({ id: accessRequests.id });
    if (!done) throw new UserError("This request was already handled.");
  });
}

/** Active coordinators other than `excludeId`, for pickers. */
export async function listCoordinators(viewer: Viewer, excludeId?: string) {
  return withUser(viewer.userId, async (tx) => {
    const ids = (await tx.select({ id: staffRoles.staffId }).from(staffRoles).where(eq(staffRoles.role, "coordinator"))).map((r) => r.id);
    if (ids.length === 0) return [];
    return tx
      .select({ id: staff.id, fullName: staff.fullName })
      .from(staff)
      .where(and(inArray(staff.id, ids), eq(staff.status, "active"), excludeId ? ne(staff.id, excludeId) : undefined))
      .orderBy(asc(staff.fullName));
  });
}
