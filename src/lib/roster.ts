/**
 * Reading a staff list (from Paychex or any spreadsheet) for import: CSV or the first sheet of an
 * Excel file, with a header row. Columns are found by their names, so the export doesn't need a
 * fixed layout:
 * - the name: "Full name", "Name" or "Employee name", or "First name" + "Last name". A name
 *   written "Last, First" is turned around.
 * - the email: a column with "email" in its name, a work email first.
 * - the mobile number: "Mobile" or "Cell" first, then any "Phone" column that isn't a home or
 *   work line.
 */
import { normalizeEmail } from "@/lib/contact";
import { cleanName } from "@/lib/names";
import { normalizeUsPhone } from "@/lib/phone";

export class RosterFileError extends Error {}

export type RosterRow = {
  /** The spreadsheet row number, for messages. */
  line: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** Why the row can't be imported as it is. */
  problems: string[];
  /** Something left out, though the row can still be imported. */
  notes: string[];
};

export type RosterColumns = { name: string; email: string | null; phone: string | null };

export const MAX_ROSTER_ROWS = 2000;

/** A small CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const key = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z]/g, "");

function findColumns(header: unknown[]) {
  const keys = header.map(key);
  const find = (...tests: ((k: string) => boolean)[]) => {
    for (const test of tests) {
      const i = keys.findIndex(test);
      if (i >= 0) return i;
    }
    return -1;
  };
  const full = find((k) => ["fullname", "name", "employeename", "employee", "legalname"].includes(k));
  const first = find((k) => k === "preferredfirstname" || k === "preferredname", (k) => k === "firstname" || k === "first" || k === "legalfirstname");
  const last = find((k) => k === "lastname" || k === "last" || k === "legallastname");
  const email = find(
    (k) => k.includes("email") && k.includes("work"),
    (k) => k === "email" || k === "emailaddress",
    (k) => k.includes("email") && !k.includes("personal"),
    (k) => k.includes("email"),
  );
  const phone = find(
    (k) => k.includes("mobile") || k.includes("cell"),
    (k) => k.includes("phone") && !k.includes("home") && !k.includes("work") && !k.includes("emergency"),
  );
  return { full, first, last, email, phone };
}

/** "Ellery, Rowan" → "Rowan Ellery". */
function turnAround(name: string) {
  const m = /^([^,]+),\s*(.+)$/.exec(name);
  return m ? `${m[2]} ${m[1]}` : name;
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Finds the header row (in the first 10) and reads each person. Blank rows are skipped. */
export function parseRoster(table: unknown[][]): { rows: RosterRow[]; columns: RosterColumns } {
  let headerAt = -1;
  let cols: ReturnType<typeof findColumns> | null = null;
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const c = findColumns(table[i] ?? []);
    if ((c.full >= 0 || (c.first >= 0 && c.last >= 0)) && (c.email >= 0 || c.phone >= 0)) {
      headerAt = i;
      cols = c;
      break;
    }
  }
  if (!cols) {
    throw new RosterFileError(
      "Couldn't find the columns. The first row should have headings like “Full name” (or “First name” and “Last name”), “Email” and “Mobile phone”.",
    );
  }
  const header = table[headerAt];
  const useFull = cols.full >= 0 && !(cols.first >= 0 && cols.last >= 0);
  const columns: RosterColumns = {
    name: useFull ? text(header[cols.full]) : `${text(header[cols.first])} + ${text(header[cols.last])}`,
    email: cols.email >= 0 ? text(header[cols.email]) : null,
    phone: cols.phone >= 0 ? text(header[cols.phone]) : null,
  };

  const rows: RosterRow[] = [];
  for (let i = headerAt + 1; i < table.length; i++) {
    const r = table[i] ?? [];
    const rawName = useFull ? turnAround(text(r[cols.full])) : `${text(r[cols.first])} ${text(r[cols.last])}`;
    const fullName = cleanName(rawName);
    const emailText = cols.email >= 0 ? text(r[cols.email]) : "";
    const phoneText = cols.phone >= 0 ? text(r[cols.phone]) : "";
    if (!fullName && !emailText && !phoneText) continue;
    if (rows.length >= MAX_ROSTER_ROWS) throw new RosterFileError(`That's more than ${MAX_ROSTER_ROWS} people. Please split the list.`);
    const email = emailText ? normalizeEmail(emailText) : null;
    const phone = phoneText ? normalizeUsPhone(phoneText) : null;
    const problems: string[] = [];
    const notes: string[] = [];
    if (!fullName) problems.push("No name");
    // A bad email or number only stops the row when there's nothing else to sign in with.
    if (emailText && !email) (phone ? notes : problems).push(`“${emailText}” isn't an email address`);
    if (phoneText && !phone) (email ? notes : problems).push(`“${phoneText}” isn't a US phone number`);
    if (!emailText && !phoneText) problems.push("No email or mobile number");
    rows.push({ line: i + 1, fullName, email, phone, problems, notes });
  }
  if (rows.length === 0) throw new RosterFileError("The file has headings but no people under them.");
  return { rows, columns };
}
