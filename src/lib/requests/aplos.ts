/**
 * Approved claims as Aplos payments, the way SCCSC finance enters them in the bank register:
 * - One payment per person per batch, even when they're paid for several claims.
 * - Each claim gets a label, used as the line description and listed in the memo:
 *   MIL + the date of the last trip (MIL092526), CELL + the last day of the phone bill period
 *   (CELL103126 for September–October), and later REIMB for itemized reimbursements.
 * - One split per budget code (account-fund-school) and label. Trips go to the mileage account
 *   for their direct or indirect choice, and their parking to the parking account; phone bills to
 *   the phone account.
 * The rows follow the Imports tab of the Aplos register import template.
 */
import type { WriteCell } from "@/lib/xlsx";
import { budgetCode } from "@/lib/budget-codes";
import type { AccountMapping } from "@/lib/settings";
import { periodOf, type Month } from "./phone";

export type CostType = "direct" | "indirect" | null;

/** What a payment needs from one claim in the batch. */
export type PaymentClaim = {
  ownerId: string;
  /** The person's name as an Aplos contact. */
  payee: string;
  type: "mileage" | "phone";
  trips: { date: string; costType: CostType; amountCents: number; parkingCents: number; siteCode: string | null; fundCode: string | null }[];
  phoneMonths: { month: Month; amountCents: number; siteCode: string | null; fundCode: string | null }[];
};

export type PaymentLine = {
  label: string;
  kind: "mileage" | "parking" | "phone";
  account: string | null;
  fund: string | null;
  site: string | null;
  cents: number;
  budgetCode: string;
  /** Why this line needs a look before it goes into Aplos. */
  problems: string[];
};

export type Payment = { ownerId: string; payee: string; labels: string[]; memo: string; totalCents: number; lines: PaymentLine[] };

/** "2026-09-25" → "092526". */
export function mmddyy(iso: string) {
  return `${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(2, 4)}`;
}

/** The last day of a month: "2026-10-01" → "2026-10-31". */
export function lastDayOfMonth(month: Month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** MIL + the date of the claim's last trip. */
export function mileageLabel(tripDates: string[]) {
  return `MIL${mmddyy([...tripDates].sort().at(-1) ?? "")}`;
}

/** CELL + the last day of the phone bill period the month is in. */
export function phoneLabel(month: Month, monthsPerClaim: number) {
  return `CELL${mmddyy(lastDayOfMonth(periodOf(month, monthsPerClaim).end))}`;
}

const KIND_ORDER = { mileage: 0, parking: 1, phone: 2 } as const;
const LABEL_ORDER = (label: string) => (label.startsWith("MIL") ? 0 : label.startsWith("CELL") ? 1 : 2);

/**
 * Groups a batch's claims into one payment per person. `known` lists the account numbers that
 * exist in Aplos (imported), so a missing one is flagged.
 */
export function buildPayments(claims: PaymentClaim[], mapping: AccountMapping, monthsPerClaim: number, known: { accounts: Set<string> }): Payment[] {
  type Draft = Payment & { keyed: Map<string, PaymentLine> };
  const byOwner = new Map<string, Draft>();
  const lineFor = (p: Draft, label: string, kind: PaymentLine["kind"], account: string | null, fund: string | null, site: string | null) => {
    const key = [label, kind, account, fund, site].join("|");
    let line = p.keyed.get(key);
    if (!line) {
      const problems: string[] = [];
      if (!site) problems.push("No school or site");
      else if (!fund) problems.push("The school or site has no fund");
      if (!account) problems.push(kind === "phone" ? "No account" : "Not marked direct or indirect");
      else if (!known.accounts.has(account)) problems.push(`Account ${account} isn't in the imported list`);
      line = { label, kind, account, fund, site, cents: 0, budgetCode: budgetCode(account, fund, site), problems };
      p.keyed.set(key, line);
    }
    return line;
  };

  for (const c of claims) {
    const p: Draft = byOwner.get(c.ownerId) ?? { ownerId: c.ownerId, payee: c.payee, labels: [], memo: "", totalCents: 0, lines: [], keyed: new Map() };
    byOwner.set(c.ownerId, p);
    if (c.type === "mileage" && c.trips.length) {
      const label = mileageLabel(c.trips.map((t) => t.date));
      for (const t of c.trips) {
        const mileage = t.amountCents - t.parkingCents;
        const travel = t.costType === "direct" ? mapping.mileageDirect : t.costType === "indirect" ? mapping.mileageIndirect : null;
        if (mileage > 0) lineFor(p, label, "mileage", travel, t.fundCode, t.siteCode).cents += mileage;
        if (t.parkingCents > 0) {
          const parking = t.costType === "direct" ? mapping.parkingDirect : t.costType === "indirect" ? mapping.parkingIndirect : null;
          lineFor(p, label, "parking", parking, t.fundCode, t.siteCode).cents += t.parkingCents;
        }
      }
      if (!p.labels.includes(label)) p.labels.push(label);
    }
    if (c.type === "phone") {
      for (const m of c.phoneMonths) {
        const label = phoneLabel(m.month, monthsPerClaim);
        lineFor(p, label, "phone", mapping.phone, m.fundCode, m.siteCode).cents += m.amountCents;
        if (!p.labels.includes(label)) p.labels.push(label);
      }
    }
  }

  return [...byOwner.values()]
    .map(({ keyed, ...p }) => {
      const labels = [...p.labels].sort((a, b) => LABEL_ORDER(a) - LABEL_ORDER(b) || a.localeCompare(b));
      const lines = [...keyed.values()]
        .filter((l) => l.cents > 0)
        .sort((a, b) => LABEL_ORDER(a.label) - LABEL_ORDER(b.label) || a.label.localeCompare(b.label) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.budgetCode.localeCompare(b.budgetCode));
      return { ...p, labels, memo: labels.join(", "), lines, totalCents: lines.reduce((n, l) => n + l.cents, 0) };
    })
    .filter((p) => p.lines.length > 0)
    .sort((a, b) => a.payee.localeCompare(b.payee));
}

/** Aplos's own names for accounts, funds and school tags, for the import file. */
export type AplosNames = { accounts: Map<string, string>; funds: Map<string, string>; sites: Map<string, string> };

export const IMPORT_COLUMNS = ["Date", "Note/Memo", "Payee", "Check #", "Account", "Fund", "Comment", "Amount", "Tags: Schools"];

/**
 * The Imports tab: one row per split, with the payment's date, memo, payee and check number on
 * each. Amounts are negative (money going out of the register). Check numbers count up from
 * `firstCheck`, in payee order, when one is given.
 */
export function importRows(payments: Payment[], names: AplosNames, { date, firstCheck }: { date: string; firstCheck: number | null }): WriteCell[][] {
  const rows: WriteCell[][] = [IMPORT_COLUMNS];
  payments.forEach((p, i) => {
    const check = firstCheck === null ? null : firstCheck + i;
    for (const l of p.lines) {
      rows.push([
        { date },
        p.memo,
        p.payee,
        check,
        l.account ? (names.accounts.get(l.account) ?? l.account) : null,
        l.fund ? (names.funds.get(l.fund) ?? l.fund) : null,
        l.label,
        { money: -l.cents / 100 },
        l.site ? (names.sites.get(l.site) ?? l.site) : null,
      ]);
    }
  });
  return rows;
}
