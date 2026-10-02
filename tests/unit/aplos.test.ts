import { describe, expect, it } from "vitest";
import { buildPayments, importRows, lastDayOfMonth, mileageLabel, mmddyy, phoneLabel, type PaymentClaim } from "@/lib/requests/aplos";
import { ACCOUNT_MAPPING_DEFAULTS } from "@/lib/settings";

const known = { accounts: new Set(["5700", "5701", "5702", "5703", "5430"]) };
const trip = (date: string, costType: "direct" | "indirect" | null, amountCents: number, parkingCents = 0, siteCode: string | null = "211", fundCode: string | null = "200") => ({
  date,
  costType,
  amountCents,
  parkingCents,
  siteCode,
  fundCode,
});

describe("labels", () => {
  it("writes dates as MMDDYY", () => {
    expect(mmddyy("2026-09-25")).toBe("092526");
    expect(lastDayOfMonth("2026-02-01")).toBe("2026-02-28");
    expect(lastDayOfMonth("2028-02-01")).toBe("2028-02-29");
    expect(lastDayOfMonth("2026-12-01")).toBe("2026-12-31");
  });

  it("labels mileage by the last trip, whatever order the trips are in", () => {
    expect(mileageLabel(["2026-06-29", "2026-06-02", "2026-06-15"])).toBe("MIL062926");
  });

  it("labels phone bills by the last day of their two-month period", () => {
    expect(phoneLabel("2026-07-01", 2)).toBe("CELL083126");
    expect(phoneLabel("2026-08-01", 2)).toBe("CELL083126");
    expect(phoneLabel("2026-09-01", 2)).toBe("CELL103126");
    expect(phoneLabel("2026-10-01", 2)).toBe("CELL103126");
    expect(phoneLabel("2026-03-01", 1)).toBe("CELL033126");
  });
});

describe("buildPayments", () => {
  const claims: PaymentClaim[] = [
    {
      ownerId: "a",
      payee: "Rowan Ellery",
      type: "mileage",
      trips: [
        trip("2026-09-02", "direct", 1000),
        trip("2026-09-25", "direct", 2500, 600),
        trip("2026-09-10", "indirect", 800, 0, "9", "1"),
      ],
      phoneMonths: [],
    },
    {
      ownerId: "a",
      payee: "Rowan Ellery",
      type: "phone",
      trips: [],
      phoneMonths: [
        { month: "2026-09-01", amountCents: 4500, siteCode: "211", fundCode: "200" },
        { month: "2026-10-01", amountCents: 4500, siteCode: "211", fundCode: "200" },
      ],
    },
    { ownerId: "b", payee: "Marcus Bell", type: "mileage", trips: [trip("2026-08-31", "indirect", 1200, 0, "252", "200")], phoneMonths: [] },
  ];

  it("makes one payment per person with the memo in MIL, CELL order", () => {
    const payments = buildPayments([claims[1], claims[0], claims[2]], ACCOUNT_MAPPING_DEFAULTS, 2, known);
    expect(payments.map((p) => p.payee)).toEqual(["Marcus Bell", "Rowan Ellery"]);
    const rowan = payments[1];
    expect(rowan.memo).toBe("MIL092526, CELL103126");
    expect(rowan.totalCents).toBe(1000 + 2500 + 800 + 9000);
  });

  it("splits by budget code, with parking on its own account", () => {
    const rowan = buildPayments(claims, ACCOUNT_MAPPING_DEFAULTS, 2, known)[1];
    expect(rowan.lines.map((l) => [l.budgetCode, l.label, l.cents])).toEqual([
      ["5700-1-9", "MIL092526", 800],
      ["5702-200-211", "MIL092526", 1000 + 1900],
      ["5703-200-211", "MIL092526", 600],
      ["5430-200-211", "CELL103126", 9000],
    ]);
    expect(rowan.lines.every((l) => l.problems.length === 0)).toBe(true);
  });

  it("flags lines that can't go into Aplos as they are", () => {
    const [p] = buildPayments(
      [
        {
          ownerId: "c",
          payee: "Lena Ortiz",
          type: "mileage",
          trips: [trip("2026-09-01", null, 500), trip("2026-09-02", "direct", 700, 0, null, null), trip("2026-09-03", "direct", 300, 0, "999", null)],
          phoneMonths: [],
        },
      ],
      { ...ACCOUNT_MAPPING_DEFAULTS, mileageDirect: "6000" },
      2,
      known,
    );
    expect(p.lines.map((l) => [l.budgetCode, l.problems])).toEqual([
      ["?-200-211", ["Not marked direct or indirect"]],
      ["6000-?-?", ["No school or site", "Account 6000 isn't in the imported list"]],
      ["6000-?-999", ["The school or site has no fund", "Account 6000 isn't in the imported list"]],
    ]);
  });

  it("writes the Imports rows with Aplos's names, negative amounts and check numbers", () => {
    const payments = buildPayments(claims, ACCOUNT_MAPPING_DEFAULTS, 2, known);
    const names = {
      accounts: new Map([["5702", "5702 - Mileage - Direct"]]),
      funds: new Map([["200", "200 - Twin Rivers USD"]]),
      sites: new Map([["211", "211 - FOOTHILL HIGH SCHOOL"]]),
    };
    const rows = importRows(payments, names, { date: "2026-10-02", firstCheck: 1040 });
    expect(rows[0]).toEqual(["Date", "Note/Memo", "Payee", "Check #", "Account", "Fund", "Comment", "Amount", "Tags: Schools"]);
    expect(rows[1]).toEqual([{ date: "2026-10-02" }, "MIL083126", "Marcus Bell", 1040, "5700", "200 - Twin Rivers USD", "MIL083126", { money: -12 }, "252"]);
    expect(rows[3]).toEqual([
      { date: "2026-10-02" },
      "MIL092526, CELL103126",
      "Rowan Ellery",
      1041,
      "5702 - Mileage - Direct",
      "200 - Twin Rivers USD",
      "MIL092526",
      { money: -29 },
      "211 - FOOTHILL HIGH SCHOOL",
    ]);
    expect(rows).toHaveLength(1 + 1 + 4);
    expect(importRows(payments, names, { date: "2026-10-02", firstCheck: null })[1][3]).toBeNull();
  });
});
