import { describe, expect, it } from "vitest";
import { parseCsv, parseRoster, RosterFileError } from "@/lib/roster";
import { checkRules, describeRule, formatRateDollars, parseRate, type RulesFields } from "@/lib/rules";
import { checkStaffInput, type StaffFields } from "@/lib/staff";

const person = (over: Partial<StaffFields> = {}): StaffFields => ({
  fullName: "  Ava   Pike ",
  email: " Ava.Pike@Example.org ",
  phone: "",
  roles: ["employee"],
  coordinatorId: "",
  siteId: "",
  aplosName: "",
  active: true,
  ...over,
});

describe("checkStaffInput", () => {
  it("tidies a person's details", () => {
    const { input } = checkStaffInput(person({ phone: "916-555-0141", roles: ["coordinator", "employee", "boss"], aplosName: "Pike, Ava" }));
    expect(input).toMatchObject({
      fullName: "Ava Pike",
      email: "ava.pike@example.org",
      phone: "+19165550141",
      roles: ["employee", "coordinator"],
      coordinatorId: null,
      aplosName: "Pike, Ava",
    });
  });

  it("drops a name in Aplos that's the same as their name", () => {
    expect(checkStaffInput(person({ aplosName: "Ava Pike" })).input?.aplosName).toBeNull();
  });

  it("explains what's missing or wrong", () => {
    expect(checkStaffInput(person({ fullName: " ", email: "", phone: "" })).errors).toEqual({
      fullName: "Enter their full name.",
      email: "Add an email or a mobile number. It's how they sign in.",
    });
    const { errors } = checkStaffInput(person({ email: "ava@", phone: "555-0141", roles: [] }));
    expect(Object.keys(errors).sort()).toEqual(["email", "phone", "roles"]);
  });
});

describe("rules", () => {
  const fields = (over: Partial<RulesFields> = {}): RulesFields => ({
    homeTripRule: "flag",
    bulkApproveMaxCents: "$150",
    requireSite: true,
    maxTripAgeDays: "365",
    sessionDays: "30",
    phoneMonthsPerClaim: "2",
    phonePeriodsBack: "1",
    ...over,
  });

  it("reads the rules form", () => {
    expect(checkRules(fields()).rules).toEqual({
      homeTripRule: "flag",
      bulkApproveMaxCents: 15000,
      requireSite: true,
      maxTripAgeDays: 365,
      sessionDays: 30,
      phoneMonthsPerClaim: 2,
      phonePeriodsBack: 1,
    });
  });

  it("refuses values outside the allowed ranges", () => {
    const { errors } = checkRules(fields({ homeTripRule: "maybe", bulkApproveMaxCents: "lots", sessionDays: "0", maxTripAgeDays: "2", phoneMonthsPerClaim: "5", phonePeriodsBack: "-1" }));
    expect(Object.keys(errors).sort()).toEqual(["bulkApproveMaxCents", "homeTripRule", "maxTripAgeDays", "phoneMonthsPerClaim", "phonePeriodsBack", "sessionDays"]);
  });

  it("describes changes for the history", () => {
    expect(describeRule("homeTripRule", "block")).toBe("Trips from home: don't allow them");
    expect(describeRule("bulkApproveMaxCents", 0)).toBe("Bulk approval: off");
    expect(describeRule("sessionDays", 45)).toBe("Stay signed in for: 45 days");
  });
});

describe("rates", () => {
  it("reads dollars into stored cents", () => {
    expect(parseRate("0.725", "mileage")).toBe("72.50");
    expect(parseRate("$0.76", "mileage")).toBe("76.00");
    expect(parseRate("45", "phone")).toBe("4500.00");
    expect(parseRate("0", "mileage")).toBeNull();
    expect(parseRate("6", "mileage")).toBeNull();
    expect(parseRate("abc", "phone")).toBeNull();
  });

  it("shows rates in dollars", () => {
    expect(formatRateDollars("72.50", "mileage")).toBe("$0.725 a mile");
    expect(formatRateDollars("76.00", "mileage")).toBe("$0.76 a mile");
    expect(formatRateDollars("4500.00", "phone")).toBe("$45.00 a month");
  });
});

describe("reading a staff list", () => {
  it("reads CSV with quotes, commas and line breaks", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "two\nlines", "3"],
    ]);
  });

  it("finds the columns in a Paychex-style export", () => {
    const { rows, columns } = parseRoster([
      ["Staff list, printed today"],
      ["Last Name", "First Name", "Personal Email", "Work Email", "Home Phone", "Cell Phone"],
      ["Pike", "Ava", "ava@example.net", "Ava.Pike@example.org", "(916) 555-0177", "916.555.0141"],
      [null, null, null, null, null, null],
      ["Okafor", "Wren", "", "wren@", "", "12"],
      ["Ortiz", "Juniper", "", "bad-email", "", "(916) 555-0199"],
    ]);
    expect(columns).toEqual({ name: "First Name + Last Name", email: "Work Email", phone: "Cell Phone" });
    expect(rows).toEqual([
      { line: 3, fullName: "Ava Pike", email: "ava.pike@example.org", phone: "+19165550141", problems: [], notes: [] },
      { line: 5, fullName: "Wren Okafor", email: null, phone: null, problems: ["“wren@” isn't an email address", "“12” isn't a US phone number"], notes: [] },
      { line: 6, fullName: "Juniper Ortiz", email: null, phone: "+19165550199", problems: [], notes: ["“bad-email” isn't an email address"] },
    ]);
  });

  it("turns “Last, First” names around", () => {
    const { rows } = parseRoster([
      ["Employee Name", "Email"],
      ["Pike, Ava", "ava.pike@example.org"],
    ]);
    expect(rows[0].fullName).toBe("Ava Pike");
  });

  it("explains a file it can't read", () => {
    expect(() => parseRoster([["Something", "Else"]])).toThrow(RosterFileError);
    expect(() => parseRoster([["Name", "Email"]])).toThrow("no people");
  });
});
