/**
 * Budget codes, as SCCSC writes them: ACCOUNT-FUND-SCHOOL, for example 5430-200-211:
 * - 5430: the account, what kind of cost it is (Telephone (Indirect)).
 * - 200: the fund, which is the school district (Twin Rivers USD) or the Center.
 * - 211: the Aplos "Schools" tag, the school or site in that district (Foothill High School).
 *
 * The lists come from Aplos: an admin imports the register import template, whose Accounts,
 * Funds and "Tags - Schools" tabs hold all three (tags grouped by fund).
 */
import type { CellValue, ReadSheet } from "@/lib/xlsx";

export type ImportedFund = { code: string; name: string; aplosName: string };
export type ImportedAccount = { number: string; name: string; parentNumber: string | null; aplosName: string };
export type ImportedSite = { code: string; name: string; fundCode: string | null; aplosName: string };
export type AplosLists = { funds: ImportedFund[]; accounts: ImportedAccount[]; sites: ImportedSite[]; warnings: string[] };

/** "200 - Twin Rivers USD" → { code: "200", name: "Twin Rivers USD" }. */
export function splitCodeName(text: string): { code: string; name: string } | null {
  const m = /^\s*([0-9]+)\s*-\s*(.*?)\s*$/.exec(text);
  if (!m || !m[2]) return null;
  return { code: m[1], name: m[2].replace(/\s*-$/, "").trim() };
}

/** "5430-200-211". Missing parts show as "?" so the gap is obvious. */
export function budgetCode(account: string | null | undefined, fund: string | null | undefined, site: string | null | undefined) {
  return [account || "?", fund || "?", site || "?"].join("-");
}

const cellText = (v: CellValue | undefined) => (v === null || v === undefined ? "" : String(v).trim());

export class AplosFileError extends Error {}

/**
 * Reads the Aplos register import template. Accounts keeps expense accounts only (the ones a
 * reimbursement can be charged to). Throws AplosFileError with a plain explanation if the file
 * isn't the template.
 */
export function parseAplosTemplate(sheets: ReadSheet[]): AplosLists {
  const find = (name: string) => sheets.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  const fundsSheet = find("Funds");
  const accountsSheet = find("Accounts");
  const tagsSheet = sheets.find((s) => /^tags\b/i.test(s.name.trim()));
  if (!fundsSheet || !accountsSheet || !tagsSheet) {
    throw new AplosFileError(
      "This file doesn't look like the Aplos register import template. It needs the Accounts, Funds and Tags - Schools tabs.",
    );
  }
  const warnings: string[] = [];

  const funds: ImportedFund[] = [];
  for (const row of fundsSheet.rows) {
    const text = cellText(row[0]);
    const parsed = splitCodeName(text);
    if (!parsed) continue;
    if (funds.some((f) => f.code === parsed.code)) continue;
    funds.push({ ...parsed, aplosName: text });
  }

  const accounts: ImportedAccount[] = [];
  let category = "";
  let parent: string | null = null;
  for (const row of accountsSheet.rows) {
    const [cat, , acct, sub] = [0, 1, 2, 3].map((i) => cellText(row[i]));
    if (cat) {
      category = cat.toLowerCase();
      parent = null;
      continue;
    }
    if (category !== "expense") continue;
    const text = sub || acct;
    const parsed = splitCodeName(text);
    if (!parsed) continue;
    if (acct) parent = parsed.code;
    if (accounts.some((a) => a.number === parsed.code)) continue;
    accounts.push({ number: parsed.code, name: parsed.name, parentNumber: sub ? parent : null, aplosName: text });
  }

  const sites: ImportedSite[] = [];
  let fundCode: string | null = null;
  for (const [i, row] of tagsSheet.rows.entries()) {
    const text = cellText(row[0]);
    if (!text) continue;
    const parsed = splitCodeName(text);
    if (parsed) {
      if (sites.some((s) => s.code === parsed.code)) {
        warnings.push(`Tag ${parsed.code} is listed twice; the first one was kept.`);
        continue;
      }
      sites.push({ ...parsed, fundCode, aplosName: text });
      continue;
    }
    if (i === 0) continue; // the tag category's own name, e.g. "Schools"
    // A group heading: "Fund 200 - TRUSD School Tags", or a name like "Allocate".
    const fund = /^fund\s+([0-9]+)\b/i.exec(text);
    if (fund) fundCode = fund[1];
    else {
      const byName = funds.find((f) => f.name.toLowerCase().startsWith(text.toLowerCase()));
      fundCode = byName?.code ?? null;
      if (!byName) warnings.push(`Couldn't tell which fund the "${text}" tags belong to. Set it by hand if they're used.`);
    }
    if (fundCode && !funds.some((f) => f.code === fundCode)) {
      warnings.push(`The tags under "${text}" point to fund ${fundCode}, which isn't in the Funds tab.`);
    }
  }

  if (funds.length === 0 || accounts.length === 0 || sites.length === 0) {
    throw new AplosFileError("The Accounts, Funds or Tags tab is empty. Download a fresh template from Aplos and try again.");
  }
  return { funds, accounts, sites, warnings };
}

/** What each account choice is for (see AccountMapping in settings.ts). */
export const ACCOUNT_MAPPING_LABELS: Record<"mileageDirect" | "mileageIndirect" | "parkingDirect" | "parkingIndirect" | "phone", string> = {
  mileageDirect: "Mileage, direct",
  mileageIndirect: "Mileage, indirect",
  parkingDirect: "Parking, direct",
  parkingIndirect: "Parking, indirect",
  phone: "Phone bills",
};
