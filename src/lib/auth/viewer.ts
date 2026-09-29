import "server-only";

import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { staff, staffRoles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { getSessionUserId } from "./session";

export type Role = "employee" | "coordinator" | "finance" | "admin";

/** The signed-in staff member. */
export type Viewer = {
  userId: string;
  staffId: string;
  fullName: string;
  roles: Role[];
  coordinatorId: string | null;
  defaultProgramId: string | null;
};

/** The signed-in, active staff member, or null. Memoized per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return withUser(userId, async (tx) => {
    const [me] = await tx.select().from(staff).where(eq(staff.userId, userId)).limit(1);
    if (!me || me.status !== "active") return null;
    const roles = await tx.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.staffId, me.id));
    return {
      userId,
      staffId: me.id,
      fullName: me.fullName,
      roles: roles.map((r) => r.role),
      coordinatorId: me.coordinatorId,
      defaultProgramId: me.defaultProgramId,
    };
  });
});

/** For pages and actions that need a signed-in staff member. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer) return viewer;
  // Signed in (phone verified) but not active staff yet: show their access request status.
  if (await getSessionUserId()) redirect("/pending");
  redirect("/sign-in");
}

export function hasRole(viewer: Viewer, ...roles: Role[]) {
  return roles.some((r) => viewer.roles.includes(r));
}

/** 404 rather than 403, so role-only areas aren't advertised. */
export async function requireRole(...roles: Role[]): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!hasRole(viewer, ...roles)) notFound();
  return viewer;
}
