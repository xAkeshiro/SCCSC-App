import { describe, expect, it } from "vitest";
import { demoEstimateMiles } from "@/lib/distance";
import { formatCents, formatRate, mileageAmountCents, normalizeMiles, toScaledInt } from "@/lib/money";
import { cleanName, namesMatch } from "@/lib/names";
import { formatPhone, maskPhone, normalizeUsPhone } from "@/lib/phone";

describe("money", () => {
  it("parses decimals exactly, rounding half up", () => {
    expect(toScaledInt("12.4", 1)).toBe(124);
    expect(toScaledInt("12.45", 1)).toBe(125);
    expect(toScaledInt("12.44", 1)).toBe(124);
    expect(toScaledInt("72.5", 2)).toBe(7250);
    expect(toScaledInt("7", 1)).toBe(70);
    expect(toScaledInt("-1", 1)).toBeNull();
    expect(toScaledInt("abc", 1)).toBeNull();
  });

  it("calculates reimbursements in cents", () => {
    expect(mileageAmountCents("12.4", "72.50")).toBe(899); // 12.4 x $0.725 = $8.99
    expect(mileageAmountCents("10.0", "70.00")).toBe(700);
    expect(mileageAmountCents("0.1", "72.50")).toBe(7); // 7.25 cents rounds to 7
    expect(mileageAmountCents("0.3", "72.50")).toBe(22); // 21.75 cents rounds half up to 22
    expect(mileageAmountCents("123.4", "65.50")).toBe(8083); // 8082.7 -> 8083
  });

  it("formats for people", () => {
    expect(formatCents(899)).toBe("$8.99");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatRate("72.50")).toBe("72.5¢ per mile");
    expect(normalizeMiles(8.44)).toBe("8.4");
  });
});

describe("phone numbers", () => {
  it("accepts the ways people type US numbers", () => {
    expect(normalizeUsPhone("(916) 555-0101")).toBe("+19165550101");
    expect(normalizeUsPhone("916.555.0101")).toBe("+19165550101");
    expect(normalizeUsPhone("+1 916 555 0101")).toBe("+19165550101");
    expect(normalizeUsPhone("19165550101")).toBe("+19165550101");
    expect(normalizeUsPhone("555-0101")).toBeNull();
    expect(normalizeUsPhone("(016) 555-0101")).toBeNull();
  });

  it("formats and masks", () => {
    expect(formatPhone("+19165550101")).toBe("(916) 555-0101");
    expect(maskPhone("+19165550101")).toBe("(•••) •••-0101");
  });
});

describe("roster name matching", () => {
  it("ignores case, accents, spacing and punctuation", () => {
    expect(namesMatch("Rowan Ellery", "  rowan   ELLERY ")).toBe(true);
    expect(namesMatch("Mary-Jane O'Neil", "maryjane oneil")).toBe(true);
    expect(namesMatch("José Núñez", "Jose Nunez")).toBe(true);
    expect(namesMatch("陳小明", "陳小明")).toBe(true);
  });

  it("does not match different names (those go to an admin)", () => {
    expect(namesMatch("Rob Ellery", "Rowan Ellery")).toBe(false);
    expect(namesMatch("", "")).toBe(false);
  });

  it("tidies typed names", () => {
    expect(cleanName("  Rowan   Ellery ")).toBe("Rowan Ellery");
  });
});

describe("demo distance estimate", () => {
  const office = { lat: 38.5905, lng: -121.418 };
  const site = { lat: 38.5412, lng: -121.4617 };

  it("estimates road miles between known places, one decimal", () => {
    const oneWay = demoEstimateMiles([office, site], false)!;
    expect(oneWay).toBeGreaterThan(4);
    expect(oneWay).toBeLessThan(6);
    expect(Math.round(oneWay * 10)).toBe(oneWay * 10);
    const round = demoEstimateMiles([office, site], true)!;
    expect(round).toBeCloseTo(oneWay * 2, 0);
  });

  it("gives no estimate when a point has no coordinates", () => {
    expect(demoEstimateMiles([office, { lat: null, lng: null }], false)).toBeNull();
    expect(demoEstimateMiles([office], false)).toBeNull();
  });
});

describe("sign-in code provider", () => {
  it("refuses to show codes on screen when a real database is configured", async () => {
    const { getCodeProvider } = await import("@/lib/auth/code-provider");
    expect(getCodeProvider().channel).toBe("screen");
    process.env.DATABASE_URL = "postgres://example/real";
    try {
      expect(() => getCodeProvider()).toThrow(/can't be used with a real database/);
    } finally {
      delete process.env.DATABASE_URL;
    }
  });
});
