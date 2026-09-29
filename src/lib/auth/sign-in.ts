/**
 * What happens after someone proves they own a phone number.
 * Runs with system rights (the person isn't a known staff member yet), inside one transaction.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db";
import { accessRequests, staff, staffPrivate } from "@/db/schema";
import { cleanName, namesMatch } from "@/lib/names";

export type SignInOutcome =
  | { kind: "signed-in"; staffId: string }
  | { kind: "pending" }
  | { kind: "rejected" }
  | { kind: "inactive" };

export async function completeSignIn(
  tx: Tx,
  { userId, fullName, phoneE164 }: { userId: string; fullName: string; phoneE164: string },
): Promise<SignInOutcome> {
  // 1. Already linked to a staff record.
  const [linked] = await tx.select().from(staff).where(eq(staff.userId, userId)).limit(1);
  if (linked) return linked.status === "active" ? { kind: "signed-in", staffId: linked.id } : { kind: "inactive" };

  // 2. On the roster with this phone, not yet signed in, and the name matches: link and go.
  const [rostered] = await tx
    .select({ id: staff.id, fullName: staff.fullName, status: staff.status, userId: staff.userId })
    .from(staffPrivate)
    .innerJoin(staff, eq(staff.id, staffPrivate.staffId))
    .where(eq(staffPrivate.phoneE164, phoneE164))
    .limit(1);
  if (rostered && rostered.userId === null && namesMatch(rostered.fullName, fullName)) {
    if (rostered.status !== "active") return { kind: "inactive" };
    await tx
      .update(staff)
      .set({ userId, updatedAt: new Date() })
      .where(and(eq(staff.id, rostered.id), isNull(staff.userId)));
    return { kind: "signed-in", staffId: rostered.id };
  }

  // 3. Otherwise an admin has to check them. Reuse their latest request if there is one.
  const [latest] = await tx
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.userId, userId))
    .orderBy(desc(accessRequests.createdAt))
    .limit(1);
  if (latest?.status === "pending") return { kind: "pending" };
  if (latest?.status === "rejected") return { kind: "rejected" };

  await tx.insert(accessRequests).values({
    userId,
    fullName: cleanName(fullName),
    phoneE164,
    matchedStaffId: rostered?.userId === null ? rostered.id : null,
  });
  return { kind: "pending" };
}
