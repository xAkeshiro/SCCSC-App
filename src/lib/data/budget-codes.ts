/**
 * Budget codes for admins: importing Aplos's lists, choosing which account each kind of
 * reimbursement goes to, and hiding tags staff shouldn't pick. Runs as the signed-in admin (RLS
 * applies: only admins can change these tables).
 */
import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { accounts, funds, requestItems, settings, sites, staff } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";
import { ACCOUNT_MAPPING_LABELS, AplosFileError, parseAplosTemplate } from "@/lib/budget-codes";
import { UserError } from "@/lib/errors";
import { readSettings, type AccountMapping } from "@/lib/settings";
import { siteLabel } from "@/lib/sites";
import { XlsxError, readXlsx } from "@/lib/xlsx";
import { logAdmin } from "./admin-log";

export async function budgetCodesOverview(viewer: Viewer) {
  return withUser(viewer.userId, async (tx) => {
    const fundList = await tx.select().from(funds).orderBy(sql`nullif(regexp_replace(${funds.code}, '\\D', '', 'g'), '')::int nulls last`);
    const accountList = await tx.select().from(accounts).orderBy(asc(accounts.number));
    const siteList = await tx
      .select({
        id: sites.id,
        code: sites.code,
        name: sites.name,
        fundCode: sites.fundCode,
        active: sites.active,
        items: sql<number>`(select count(*)::int from ${requestItems} i where i.site_id = ${sites.id})`,
        people: sql<number>`(select count(*)::int from ${staff} p where p.default_site_id = ${sites.id})`,
      })
      .from(sites)
      .orderBy(asc(sites.name));
    const current = await readSettings(tx);
    const groups = fundList.map((f) => ({ fund: f, sites: siteList.filter((s) => s.fundCode === f.code) }));
    const orphans = siteList.filter((s) => !s.fundCode || !fundList.some((f) => f.code === s.fundCode));
    return {
      funds: fundList,
      accounts: accountList,
      groups: orphans.length ? [...groups, { fund: null, sites: orphans }] : groups,
      siteCount: siteList.length,
      hiddenCount: siteList.filter((s) => !s.active).length,
      mapping: current.aplosAccounts,
    };
  });
}

export type ImportSummary = {
  funds: { added: number; updated: number };
  accounts: { added: number; updated: number };
  sites: { added: number; updated: number };
  /** Sites in the app that weren't in the file (left as they are). */
  notInFile: number;
  warnings: string[];
};

/** Reads the Aplos register import template and adds or updates funds, accounts and school tags. */
export async function importAplosLists(viewer: Viewer, bytes: Uint8Array): Promise<ImportSummary> {
  return withUser(viewer.userId, (tx) => importAplosListsTx(tx, bytes));
}

/** As importAplosLists, inside a transaction running as the signed-in admin. */
export async function importAplosListsTx(tx: Tx, bytes: Uint8Array): Promise<ImportSummary> {
  let lists;
  try {
    lists = parseAplosTemplate(readXlsx(bytes));
  } catch (err) {
    if (err instanceof AplosFileError) throw new UserError(err.message);
    if (err instanceof XlsxError) throw new UserError("That file couldn't be opened as an Excel workbook (.xlsx). Download the template from Aplos again and try once more.");
    throw err;
  }
  const before = {
    funds: new Set((await tx.select({ code: funds.code }).from(funds)).map((r) => r.code)),
    accounts: new Set((await tx.select({ number: accounts.number }).from(accounts)).map((r) => r.number)),
    sites: new Set((await tx.select({ code: sites.code }).from(sites)).map((r) => r.code)),
  };
  const count = <T>(list: T[], key: (x: T) => string, existing: Set<string>) => ({
    added: list.filter((x) => !existing.has(key(x))).length,
    updated: list.filter((x) => existing.has(key(x))).length,
  });

  await tx
    .insert(funds)
    .values(lists.funds)
    .onConflictDoUpdate({ target: funds.code, set: { name: sql`excluded.name`, aplosName: sql`excluded.aplos_name`, active: true } });
  await tx
    .insert(accounts)
    .values(lists.accounts)
    .onConflictDoUpdate({
      target: accounts.number,
      set: { name: sql`excluded.name`, parentNumber: sql`excluded.parent_number`, aplosName: sql`excluded.aplos_name`, active: true },
    });
  // New tags start visible to staff; existing ones keep whatever an admin chose.
  await tx
    .insert(sites)
    .values(lists.sites)
    .onConflictDoUpdate({
      target: sites.code,
      set: { name: sql`excluded.name`, fundCode: sql`excluded.fund_code`, aplosName: sql`excluded.aplos_name` },
    });

  const inFile = new Set(lists.sites.map((s) => s.code));
  const summary: ImportSummary = {
    funds: count(lists.funds, (f) => f.code, before.funds),
    accounts: count(lists.accounts, (a) => a.number, before.accounts),
    sites: count(lists.sites, (s) => s.code, before.sites),
    notInFile: [...before.sites].filter((c) => !inFile.has(c)).length,
    warnings: lists.warnings,
  };
  const n = (c: { added: number; updated: number }) => `${c.added} new, ${c.updated} updated`;
  await logAdmin(
    tx,
    "budget_codes",
    `Imported from Aplos: funds ${n(summary.funds)}; accounts ${n(summary.accounts)}; schools and sites ${n(summary.sites)}`,
  );
  return summary;
}

const accountNumber = z.string().regex(/^\d{1,8}$/);

/** Saves which account each kind of reimbursement goes to. Each must be an imported account. */
export async function saveAccountMapping(viewer: Viewer, mapping: AccountMapping) {
  await withUser(viewer.userId, (tx) => saveAccountMappingTx(tx, viewer.staffId, mapping));
}

export async function saveAccountMappingTx(tx: Tx, staffId: string, mapping: AccountMapping) {
  for (const value of Object.values(mapping)) {
    if (!accountNumber.safeParse(value).success) throw new UserError("Choose an account for each line.");
  }
  const known = new Set((await tx.select({ number: accounts.number }).from(accounts)).map((a) => a.number));
  const missing = Object.values(mapping).find((n) => !known.has(n));
  if (missing) throw new UserError(`Account ${missing} isn't in the imported list.`);
  const before = (await readSettings(tx)).aplosAccounts;
  const changed = (Object.keys(mapping) as (keyof AccountMapping)[]).filter((k) => before[k] !== mapping[k]);
  if (changed.length === 0) return;
  await setSetting(tx, staffId, "aplos_accounts", mapping);
  await logAdmin(tx, "budget_codes", `Accounts: ${changed.map((k) => `${ACCOUNT_MAPPING_LABELS[k]} ${before[k]} → ${mapping[k]}`).join("; ")}`);
}

/** Saves a setting (RLS: admins only). */
export async function setSetting(tx: Tx, staffId: string, key: string, value: unknown) {
  const updated = await tx
    .update(settings)
    .set({ value: value as object, updatedAt: new Date(), updatedBy: staffId })
    .where(eq(settings.key, key))
    .returning({ key: settings.key });
  if (updated.length === 0) await tx.insert(settings).values({ key, value: value as object, updatedBy: staffId });
}

/** Shows or hides a school or site in the staff pickers. */
export async function setSiteActive(viewer: Viewer, siteId: string, active: boolean) {
  if (!z.string().uuid().safeParse(siteId).success) throw new UserError("School or site not found.");
  await withUser(viewer.userId, async (tx) => {
    const [done] = await tx.update(sites).set({ active }).where(eq(sites.id, siteId)).returning({ code: sites.code, name: sites.name });
    if (!done) throw new UserError("School or site not found.");
    await logAdmin(tx, "budget_codes", `${active ? "Showed" : "Hid"} ${siteLabel(done)} ${active ? "to" : "from"} staff`);
  });
}

/** Shows or hides every tag in a fund at once. */
export async function setFundSitesActive(viewer: Viewer, fundCode: string, active: boolean) {
  if (!/^\d{1,8}$/.test(fundCode)) throw new UserError("Fund not found.");
  await withUser(viewer.userId, async (tx) => {
    const changed = await tx.update(sites).set({ active }).where(eq(sites.fundCode, fundCode)).returning({ id: sites.id });
    await logAdmin(tx, "budget_codes", `${active ? "Showed" : "Hid"} all ${changed.length} schools and sites in fund ${fundCode} ${active ? "to" : "from"} staff`);
  });
}
