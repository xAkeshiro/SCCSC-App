import { describe, expect, it } from "vitest";
import { dollars, toCsv } from "@/lib/csv";

describe("CSV export", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv(["a", "b"], [["Main office, Suite 200", 'He said "hi"']])).toBe('a,b\r\n"Main office, Suite 200","He said ""hi"""\r\n');
  });

  it("stops spreadsheet formulas in text", () => {
    const csv = toCsv(["purpose"], [["=HYPERLINK(\"http://x\")"], ["+1 trip"], ["-5"], ["@cmd"]]);
    expect(csv.split("\r\n").slice(1, 5)).toEqual(['"\'=HYPERLINK(""http://x"")"', "'+1 trip", "'-5", "'@cmd"]);
  });

  it("writes numbers and yes/no plainly", () => {
    expect(toCsv(["n", "b", "empty"], [[12.5, true, null]])).toBe("n,b,empty\r\n12.5,Yes,\r\n");
    expect(dollars(899)).toBe("8.99");
  });
});
