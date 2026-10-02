import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AplosFileError, budgetCode, parseAplosTemplate, splitCodeName } from "@/lib/budget-codes";
import { readXlsx, writeXlsx } from "@/lib/xlsx";

const sample = () => readXlsx(readFileSync(path.join(__dirname, "../fixtures/aplos-template-sample.xlsx")));

describe("budget codes", () => {
  it("are written account-fund-school", () => {
    expect(budgetCode("5430", "200", "211")).toBe("5430-200-211");
    expect(budgetCode("5702", null, "211")).toBe("5702-?-211");
  });

  it("split Aplos names into code and name", () => {
    expect(splitCodeName("200 - Twin Rivers USD")).toEqual({ code: "200", name: "Twin Rivers USD" });
    expect(splitCodeName("021 - EXPERIENCE CORP")).toEqual({ code: "021", name: "EXPERIENCE CORP" });
    expect(splitCodeName("1266  - REGULAR DAY - ACADEMY")).toEqual({ code: "1266", name: "REGULAR DAY - ACADEMY" });
    expect(splitCodeName("5170 - Paychex Fees (Indirect) -")).toEqual({ code: "5170", name: "Paychex Fees (Indirect)" });
    expect(splitCodeName("Fund 200 - TRUSD School Tags")).toBeNull();
    expect(splitCodeName("Allocate")).toBeNull();
  });
});

describe("reading the Aplos register import template", () => {
  const lists = parseAplosTemplate(sample());

  it("reads the funds", () => {
    expect(lists.funds).toEqual([
      { code: "1", name: "Center/Central", aplosName: "1 - Center/Central" },
      { code: "200", name: "Twin Rivers USD", aplosName: "200 - Twin Rivers USD" },
      { code: "999", name: "Allocate Fund", aplosName: "999 - Allocate Fund" },
    ]);
  });

  it("keeps only expense accounts, each under its parent, with Aplos's own wording", () => {
    expect(lists.accounts.map((a) => [a.number, a.parentNumber])).toEqual([
      ["8550", null],
      ["5702", "8550"],
      ["5703", "8550"],
      ["8551", null],
      ["5700", "8551"],
      ["5701", "8551"],
      ["8553", null],
      ["5430", "8553"],
      ["5170", "8553"],
      ["8600", null],
    ]);
    expect(lists.accounts.find((a) => a.number === "5170")).toMatchObject({
      name: "Paychex Fees - Payroll (Indirect)",
      aplosName: "5170 - Paychex Fees - Payroll (Indirect) -",
    });
  });

  it("puts each school tag in the fund it's listed under", () => {
    const fundOf = Object.fromEntries(lists.sites.map((s) => [s.code, s.fundCode]));
    expect(fundOf).toEqual({ "9": "1", "211": "200", "021": "200", "1266": "200", "999": "999", "777": null });
    expect(lists.sites.find((s) => s.code === "1266")).toMatchObject({
      name: "REGULAR DAY - SAMPLE <ARTS> ACADEMY",
      aplosName: "1266  - REGULAR DAY - SAMPLE <ARTS> ACADEMY",
    });
  });

  it("explains what it couldn't sort out", () => {
    expect(lists.warnings).toEqual([
      'Couldn\'t tell which fund the "Mystery Group" tags belong to. Set it by hand if they\'re used.',
      "Tag 211 is listed twice; the first one was kept.",
    ]);
  });

  it("says plainly when a file isn't the template", () => {
    const other = readXlsx(writeXlsx([{ name: "Account Details", rows: [["Account Number", "Account Name"]] }]));
    expect(() => parseAplosTemplate(other)).toThrow(AplosFileError);
    expect(() => parseAplosTemplate(other)).toThrow(/Accounts, Funds and Tags - Schools/);
  });
});
