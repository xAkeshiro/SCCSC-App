import "server-only";

import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { staff, staffPrivate, staffRoles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { UserError } from "@/lib/errors";
import { nameKey, namesMatch } from "@/lib/names";
import { RosterFileError, parseCsv, parseRoster, type RosterColumns, type RosterRow } from "@/lib/roster";
import { XlsxError, readXlsx } from "@/lib/xlsx";
import { logAdmin } from "./admin-log";

export type RosterPlanRow = RosterRow & {
  kind: "new" | "update" | "same" | "problem";
  staffId: string | null;
  /** Their name on the staff list, when the row matched someone. */
  listName: string | null;
  /** What the import adds to their record (it never replaces anything). */
  adds: ("email" | "mobile number")[];
  /** Differences the import leaves alone (an admin can change them on the person's record). */
  kept: string[];
};

export type RosterPlan = {
  columns: RosterColumns;
  rows: RosterPlanRow[];
  counts: Record<RosterPlanRow["kind"], number>;
  /** Active people on the staff list who aren't in the file. */
  missing: { id: string; fullName: string }[];
};

/** Reads a CSV or an Excel file (its first sheet). */
function readRosterFile(bytes: Uint8Array) {
  let table: unknown[][];
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      table = readXlsx(bytes)[0]?.rows ?? [];
    } catch (err) {
      if (err instanceof XlsxError) throw new UserError("That Excel file couldn't be opened. Try saving it again, or as CSV.");
      throw err;
    }
  } else {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (text.includes("\u0000")) throw new UserError("That doesn't look like a CSV or Excel file.");
    table = parseCsv(text);
  }
  try {
    return parseRoster(table);
  } catch (err) {
    if (err instanceof RosterFileError) throw new UserError(err.message);
    throw err;
  }
}

async function planRoster(tx: Tx, bytes: Uint8Array): Promise<RosterPlan> {
  const parsed = readRosterFile(bytes);
  const people = await tx
    .select({ id: staff.id, fullName: staff.fullName, status: staff.status, email: staffPrivate.email, phone: staffPrivate.phoneE164 })
    .from(staff)
    .leftJoin(staffPrivate, eq(staffPrivate.staffId, staff.id));
  type Person = (typeof people)[number];
  const byEmail = new Map(people.filter((p) => p.email).map((p) => [p.email!, p]));
  const byPhone = new Map(people.filter((p) => p.phone).map((p) => [p.phone!, p]));
  const byName = new Map<string, Person[]>();
  for (const p of people) byName.set(nameKey(p.fullName), [...(byName.get(nameKey(p.fullName)) ?? []), p]);

  const seen = new Map<string, number>();
  const matched = new Set<string>();
  const rows: RosterPlanRow[] = parsed.rows.map((row) => {
    const plan: RosterPlanRow = { ...row, problems: [...row.problems], kind: "problem", staffId: null, listName: null, adds: [], kept: [] };
    for (const value of [row.email, row.phone]) {
      if (!value) continue;
      const earlier = seen.get(value);
      if (earlier) plan.problems.push(`Same ${value.includes("@") ? "email" : "number"} as row ${earlier}`);
      else seen.set(value, row.line);
    }
    const a = row.email ? byEmail.get(row.email) : undefined;
    const b = row.phone ? byPhone.get(row.phone) : undefined;
    if (a && b && a.id !== b.id) plan.problems.push(`The email is on ${a.fullName}'s record and the number on ${b.fullName}'s`);
    if (plan.problems.length) return plan;

    const sameName = byName.get(nameKey(row.fullName)) ?? [];
    const person = a ?? b ?? (sameName.length === 1 ? sameName[0] : undefined);
    if (!person) return { ...plan, kind: "new" };
    matched.add(person.id);
    plan.staffId = person.id;
    plan.listName = person.fullName;
    if (row.email && !person.email) plan.adds.push("email");
    if (row.phone && !person.phone) plan.adds.push("mobile number");
    if (!namesMatch(person.fullName, row.fullName)) plan.kept.push(`On the list as ${person.fullName}`);
    if (row.email && person.email && person.email !== row.email) plan.kept.push("A different email is on the list");
    if (row.phone && person.phone && person.phone !== row.phone) plan.kept.push("A different mobile number is on the list");
    if (person.status === "inactive") plan.kept.push("Inactive on the list");
    return { ...plan, kind: plan.adds.length ? "update" : "same" };
  });

  const counts = { new: 0, update: 0, same: 0, problem: 0 };
  for (const r of rows) counts[r.kind] += 1;
  const missing = people
    .filter((p) => p.status === "active" && !matched.has(p.id))
    .map((p) => ({ id: p.id, fullName: p.fullName }))
    .sort((x, y) => x.fullName.localeCompare(y.fullName));
  return { columns: parsed.columns, rows, counts, missing };
}

/** What importing the file would do, without changing anything. */
export async function previewRoster(viewer: Viewer, bytes: Uint8Array) {
  return withUser(viewer.userId, (tx) => planRoster(tx, bytes));
}

export async function importRoster(viewer: Viewer, bytes: Uint8Array) {
  return withUser(viewer.userId, (tx) => importRosterTx(tx, bytes));
}

/**
 * Adds the new people (as employees, reviewed by an admin until someone is chosen) and fills in a
 * missing email or mobile number for people already on the list. Nothing else is changed and
 * nobody is removed. Rows with problems are skipped.
 */
export async function importRosterTx(tx: Tx, bytes: Uint8Array) {
  const plan = await planRoster(tx, bytes);
  if (plan.counts.new + plan.counts.update === 0) throw new UserError("There's nobody to add or update in this file.");
  for (const row of plan.rows) {
    if (row.kind === "new") {
      const [created] = await tx.insert(staff).values({ fullName: row.fullName, source: "roster" }).returning({ id: staff.id });
      await tx.insert(staffPrivate).values({ staffId: created.id, email: row.email, phoneE164: row.phone });
      await tx.insert(staffRoles).values({ staffId: created.id, role: "employee" });
      await logAdmin(tx, "staff", `Added ${row.fullName} from an imported staff list`, created.id);
    } else if (row.kind === "update" && row.staffId) {
      const set = {
        ...(row.adds.includes("email") ? { email: row.email } : {}),
        ...(row.adds.includes("mobile number") ? { phoneE164: row.phone } : {}),
      };
      await tx
        .insert(staffPrivate)
        .values({ staffId: row.staffId, ...set })
        .onConflictDoUpdate({ target: staffPrivate.staffId, set: { ...set, updatedAt: new Date() } });
      await logAdmin(tx, "staff", `${row.listName}: added their ${row.adds.join(" and ")} from an imported staff list`, row.staffId);
    }
  }
  await logAdmin(tx, "staff", `Imported a staff list: ${plan.counts.new} added, ${plan.counts.update} updated, ${plan.counts.problem} skipped`);
  return { added: plan.counts.new, updated: plan.counts.update, skipped: plan.counts.problem };
}
