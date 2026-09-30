/**
 * What happens after someone proves they can read messages for an email or phone number.
 * Runs with system rights (the person isn't a known staff member yet), inside one transaction.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { accessRequests, staff, staffPrivate } from "@/db/schema";
import { rows } from "@/db/with-user";
import type { Contact } from "@/lib/contact";
import { cleanName, namesMatch } from "@/lib/names";

export type SignInOutcome =
  | { kind: "signed-in"; staffId: string }
  | { kind: "pending" }
  | { kind: "rejected" }
  | { kind: "inactive" };

/** Supabase stores auth phone numbers without the leading "+". */
export function authPhone(phoneE164: string) {
  return phoneE164.replace(/^\+/, "");
}

const contactColumn = (contact: Contact) =>
  contact.kind === "email" ? eq(staffPrivate.email, contact.value) : eq(staffPrivate.phoneE164, contact.value);

/** The roster entry with this email or phone, if any. */
async function rosterEntry(tx: Tx, contact: Contact) {
  const [entry] = await tx
    .select({ id: staff.id, fullName: staff.fullName, status: staff.status, userId: staff.userId })
    .from(staffPrivate)
    .innerJoin(staff, eq(staff.id, staffPrivate.staffId))
    .where(contactColumn(contact))
    .limit(1);
  return entry ?? null;
}

/**
 * The sign-in account (auth user) for a verified email or phone. One account per person: someone
 * who signed in by phone before and now uses the email the roster has for them (with the same
 * name) gets their existing account, with the email added to it. Everyone else gets an account
 * for what they typed, created on first sign-in.
 */
export async function signInAccount(tx: Tx, contact: Contact, fullName: string): Promise<string> {
  const column = contact.kind === "email" ? sql`email` : sql`phone`;
  const value = contact.kind === "email" ? contact.value : authPhone(contact.value);

  const [existing] = await rows<{ id: string }>(
    tx,
    sql`update auth.users set last_sign_in_at = now() where ${column} = ${value} returning id`,
  );
  if (existing) return existing.id;

  const entry = await rosterEntry(tx, contact);
  if (entry?.userId && namesMatch(entry.fullName, fullName)) {
    const [linked] = await rows<{ id: string }>(
      tx,
      sql`update auth.users set ${column} = ${value}, last_sign_in_at = now() where id = ${entry.userId}::uuid returning id`,
    );
    if (linked) return linked.id;
  }

  const [created] = await rows<{ id: string }>(
    tx,
    sql`insert into auth.users (${column}, last_sign_in_at) values (${value}, now()) returning id`,
  );
  return created.id;
}

export async function completeSignIn(
  tx: Tx,
  { userId, fullName, contact }: { userId: string; fullName: string; contact: Contact },
): Promise<SignInOutcome> {
  // 1. Already linked to a staff record.
  const [linked] = await tx.select().from(staff).where(eq(staff.userId, userId)).limit(1);
  if (linked) return linked.status === "active" ? { kind: "signed-in", staffId: linked.id } : { kind: "inactive" };

  // 2. On the roster with this email or phone, not yet signed in, and the name matches: link and go.
  const rostered = await rosterEntry(tx, contact);
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
    email: contact.kind === "email" ? contact.value : null,
    phoneE164: contact.kind === "phone" ? contact.value : null,
    matchedStaffId: rostered?.userId === null ? rostered.id : null,
  });
  return { kind: "pending" };
}
