import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { excelDate, readXlsx, writeXlsx, XlsxError } from "@/lib/xlsx";

describe("Excel files", () => {
  it("writes a workbook that reads back the same", () => {
    const bytes = writeXlsx([
      {
        name: "Imports",
        boldFirstRow: true,
        rows: [
          ["Date", "Note/Memo", "Amount"],
          [{ date: "2026-10-01" }, "MIL092526, CELL103126", { money: -23.26 }],
          [null, "Tom & Jerry <b>\"quoted\"</b>", 7],
          ["Same", "Same", null],
        ],
      },
      { name: "Second", rows: [["a"]] },
    ]);
    const sheets = readXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(["Imports", "Second"]);
    expect(sheets[0].rows).toEqual([
      ["Date", "Note/Memo", "Amount"],
      [excelDate("2026-10-01"), "MIL092526, CELL103126", -23.26],
      [null, 'Tom & Jerry <b>"quoted"</b>', 7],
      ["Same", "Same"],
    ]);
    expect(sheets[1].rows).toEqual([["a"]]);
  });

  it("dates are Excel serial numbers (days since 30 December 1899)", () => {
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-10-01")).toBe(46296);
  });

  it("reads a file made by other software (shared strings, gaps, odd spacing)", () => {
    const sheets = readXlsx(readFileSync(path.join(__dirname, "../fixtures/aplos-template-sample.xlsx")));
    expect(sheets.map((s) => s.name)).toEqual(["Imports", "Accounts", "Funds", "Tags - Schools"]);
    const accounts = sheets[1].rows;
    expect(accounts[4]).toEqual([null, null, null, "1110 - Cash - Sample Bank - Operating"]);
    expect(sheets[3].rows[6]).toEqual(["1266  - REGULAR DAY - SAMPLE <ARTS> ACADEMY"]);
  });

  it("refuses files that aren't workbooks", () => {
    expect(() => readXlsx(new TextEncoder().encode("Date,Amount\n1,2"))).toThrow(XlsxError);
  });
});
