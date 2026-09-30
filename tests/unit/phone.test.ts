import { describe, expect, it } from "vitest";
import {
  addMonths,
  claimablePeriods,
  formatMonths,
  latestOpenPeriod,
  monthOf,
  nextPeriod,
  periodOf,
  phoneAmountCents,
  validMonthsPerClaim,
} from "@/lib/requests/phone";
import { claimNumber } from "@/lib/requests/status";
import { itemsSummary } from "@/lib/requests/types";

describe("phone bill periods (2 months per claim, claimed in even months)", () => {
  it("splits the year into pairs of months from January", () => {
    expect(periodOf("2026-07-01", 2)).toMatchObject({ start: "2026-07-01", end: "2026-08-01", opens: "2026-08-01", label: "July–August 2026" });
    expect(periodOf("2026-08-01", 2).start).toBe("2026-07-01");
    expect(periodOf("2026-01-01", 2).months).toEqual(["2026-01-01", "2026-02-01"]);
    expect(periodOf("2026-12-01", 2).label).toBe("November–December 2026");
  });

  it("a period can be claimed from the first day of its last month", () => {
    expect(latestOpenPeriod("2026-09-30", 2).label).toBe("July–August 2026");
    expect(latestOpenPeriod("2026-10-01", 2).label).toBe("September–October 2026");
    expect(latestOpenPeriod("2026-01-15", 2).label).toBe("November–December 2025");
    expect(nextPeriod("2026-09-30", 2)).toMatchObject({ label: "September–October 2026", opens: "2026-10-01" });
  });

  it("offers the latest period and the ones before it that can still be claimed", () => {
    expect(claimablePeriods("2026-09-30", 2, 1).map((p) => p.label)).toEqual(["July–August 2026", "May–June 2026"]);
    expect(claimablePeriods("2026-02-01", 2, 0).map((p) => p.label)).toEqual(["January–February 2026"]);
  });

  it("works for other period lengths, and falls back to 2 for ones that don't fit the year", () => {
    expect(latestOpenPeriod("2026-03-01", 3).label).toBe("January–March 2026");
    expect(latestOpenPeriod("2026-05-20", 1).label).toBe("May 2026");
    expect(validMonthsPerClaim(5)).toBe(2);
    expect(validMonthsPerClaim("3")).toBe(3);
  });
});

describe("months", () => {
  it("does month arithmetic across years", () => {
    expect(monthOf("2026-07-19")).toBe("2026-07-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-03-01", -14)).toBe("2025-01-01");
  });

  it("reads naturally", () => {
    expect(formatMonths(["2026-07-01"])).toBe("July 2026");
    expect(formatMonths(["2026-08-01", "2026-07-01"])).toBe("July–August 2026");
    expect(formatMonths(["2026-12-01", "2027-01-01"])).toBe("December 2026–January 2027");
    expect(formatMonths(["2026-05-01", "2026-07-01", "2026-08-01"])).toBe("May, July and August 2026");
  });

  it("pays the monthly rate, rounded to the cent", () => {
    expect(phoneAmountCents("4500.00")).toBe(4500);
    expect(phoneAmountCents("4512.50")).toBe(4513);
  });
});

describe("claims of different types", () => {
  it("numbers mileage claims M- and phone bills P-", () => {
    expect(claimNumber(1001, "mileage")).toBe("M-1001");
    expect(claimNumber(1002, "phone")).toBe("P-1002");
  });

  it("summarizes what a claim holds", () => {
    expect(itemsSummary("phone", 2, "2026-07-01", "2026-08-01")).toBe("2 months · July–August 2026");
    expect(itemsSummary("phone", 1, "2026-08-01", "2026-08-01")).toBe("1 month · August 2026");
    expect(itemsSummary("mileage", 3, "2026-09-02", "2026-09-20")).toBe("3 trips · Sep 2 to Sep 20");
  });
});
