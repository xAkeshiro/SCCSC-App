import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { userMessage } from "@/db/with-user";
import { logAdmin } from "@/lib/data/admin-log";
import { addRateTx, saveRulesTx } from "@/lib/data/rates";
import { importRosterTx } from "@/lib/data/roster";
import { saveStaffTx } from "@/lib/data/staff";
import { UserError } from "@/lib/errors";
import { readSettings } from "@/lib/settings";
import type { StaffInput } from "@/lib/staff";
import { as, createTestDb, queryAs, rows, sql, staffIdOf, type TestDb } from "../support/db";

let t: TestDb;
const failure = (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (err: unknown) => (err instanceof UserError ? err.message : userMessage(err)),
  );
const person = (over: Partial<StaffInput> = {}): StaffInput => ({
  fullName: "Ava Pike",
  email: "ava.pike@example.org",
  phone: null,
  roles: ["employee"],
  coordinatorId: null,
  siteId: null,
  aplosName: null,
  active: true,
  ...over,
});
const sam = () => staffIdOf("sam");
const history = () => rows<{ summary: string; actor_name: string; area: string }>(t.db, sql`select summary, actor_name, area from public.admin_events order by id`);

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe("staff records", () => {
  it("adds a person and records it", async () => {
    const { staffId } = await as(t, "sam", (tx) => saveStaffTx(tx, sam(), null, person({ coordinatorId: staffIdOf("lena") })));
    const [row] = await rows<{ full_name: string; source: string; coordinator_id: string; email: string }>(
      t.db,
      sql`select s.full_name, s.source, s.coordinator_id, p.email from public.staff s join public.staff_private p on p.staff_id = s.id where s.id = ${staffId}::uuid`,
    );
    expect(row).toEqual({ full_name: "Ava Pike", source: "roster", coordinator_id: staffIdOf("lena"), email: "ava.pike@example.org" });
    expect((await history()).at(-1)).toEqual({ summary: "Added Ava Pike (Employee)", actor_name: "Sam Whitlock", area: "staff" });
  });

  it("records what changed, and nothing when nothing did", async () => {
    const felix = staffIdOf("felix");
    const before = person({ fullName: "Felix Hartwell", email: "felix.hartwell@example.org", phone: "+19165550108", coordinatorId: staffIdOf("lena") });
    const [{ default_site_id }] = await rows<{ default_site_id: string }>(t.db, sql`select default_site_id from public.staff where id = ${felix}::uuid`);
    const same = { ...before, siteId: default_site_id };
    expect((await as(t, "sam", (tx) => saveStaffTx(tx, sam(), felix, same))).changes).toEqual([]);
    const { changes } = await as(t, "sam", (tx) =>
      saveStaffTx(tx, sam(), felix, { ...same, roles: ["employee", "finance"], aplosName: "Hartwell, Felix", coordinatorId: staffIdOf("owen") }),
    );
    expect(changes).toEqual(["Roles: added Finance", "Reviewer: Lena Fairbanks → Owen Castellano", "Name in Aplos: Hartwell, Felix"]);
    expect((await history()).at(-1)?.summary).toBe("Felix Hartwell: Roles: added Finance. Reviewer: Lena Fairbanks → Owen Castellano. Name in Aplos: Hartwell, Felix");
  });

  it("keeps emails and numbers unique", async () => {
    expect(await failure(as(t, "sam", (tx) => saveStaffTx(tx, sam(), null, person({ fullName: "Someone Else", email: "rowan.ellery@example.org" }))))).toBe(
      "That email is already on Rowan Ellery's record.",
    );
    expect(await failure(as(t, "sam", (tx) => saveStaffTx(tx, sam(), null, person({ fullName: "Someone Else", email: null, phone: "+19165550101" }))))).toBe(
      "That mobile number is already on Rowan Ellery's record.",
    );
  });

  it("only lets an active coordinator be someone's reviewer", async () => {
    const msg = await failure(as(t, "sam", (tx) => saveStaffTx(tx, sam(), null, person({ fullName: "Bo Lane", email: "bo.lane@example.org", coordinatorId: staffIdOf("rowan") }))));
    expect(msg).toBe("Their reviewer must be an active coordinator.");
  });

  it("won't leave a team without a reviewer, or an admin locked out", async () => {
    const owen = person({ fullName: "Owen Castellano", email: "owen.castellano@example.org", phone: "+19165550105" });
    expect(await failure(as(t, "sam", (tx) => saveStaffTx(tx, sam(), staffIdOf("owen"), owen)))).toMatch(/^Owen Castellano reviews \d people\. Move them/);
    const self = person({ fullName: "Sam Whitlock", email: "sam.whitlock@example.org", phone: "+19165550107", roles: ["employee"] });
    expect(await failure(as(t, "sam", (tx) => saveStaffTx(tx, sam(), sam(), self)))).toBe("You can't remove your own Admin role. Ask another admin to do it.");
    expect(await failure(as(t, "sam", (tx) => saveStaffTx(tx, sam(), sam(), { ...self, roles: ["employee", "admin"], active: false })))).toBe(
      "You can't make yourself inactive. Ask another admin to do it.",
    );
  });

  it("can only be changed by an admin", async () => {
    expect(await failure(as(t, "hazel", (tx) => saveStaffTx(tx, staffIdOf("hazel"), null, person({ fullName: "Cy Moss", email: "cy.moss@example.org" }))))).toBe(
      "You don't have permission to do that.",
    );
  });
});

describe("the admin history", () => {
  it("is written only by admins and never changed", async () => {
    expect(await failure(as(t, "rowan", (tx) => logAdmin(tx, "rules", "Sneaky change")))).toBe("Only an admin can do that.");
    expect(await failure(t.db.execute(sql`update public.admin_events set summary = 'edited'`))).toBe("The admin history cannot be changed.");
    expect(await failure(t.db.execute(sql`delete from public.admin_events`))).toBe("The admin history cannot be changed.");
    expect(await failure(as(t, "sam", (tx) => tx.execute(sql`insert into public.admin_events (actor_name, area, summary) values ('x', 'rules', 'y')`)))).toBe(
      "You don't have permission to do that.",
    );
  });

  it("is readable by admins only", async () => {
    expect((await queryAs(t, "sam", sql`select id from public.admin_events`)).length).toBeGreaterThan(0);
    expect(await queryAs(t, "hazel", sql`select id from public.admin_events`)).toEqual([]);
  });
});

describe("rates and rules", () => {
  it("adds a rate, once per start date", async () => {
    await as(t, "sam", (tx) => addRateTx(tx, sam(), { type: "mileage", rateCents: "80.00", effectiveFrom: "2099-01-01", note: "Test" }));
    expect((await history()).at(-1)?.summary).toBe("Mileage rate from Jan 1, 2099: $0.80 a mile (Test)");
    expect(await failure(as(t, "sam", (tx) => addRateTx(tx, sam(), { type: "mileage", rateCents: "81.00", effectiveFrom: "2099-01-01", note: "" })))).toBe(
      "There's already a mileage rate starting Jan 1, 2099.",
    );
  });

  it("saves the rules that changed", async () => {
    const before = await as(t, "sam", (tx) => readSettings(tx));
    const changes = await as(t, "sam", (tx) => saveRulesTx(tx, sam(), { ...before, sessionDays: 45, homeTripRule: "block" }));
    expect(changes).toEqual(["Trips from home: don't allow them", "Stay signed in for: 45 days"]);
    const after = await as(t, "rowan", (tx) => readSettings(tx));
    expect([after.sessionDays, after.homeTripRule]).toEqual([45, "block"]);
    expect(await as(t, "sam", (tx) => saveRulesTx(tx, sam(), { ...after }))).toEqual([]);
    expect(await failure(as(t, "hazel", (tx) => saveRulesTx(tx, staffIdOf("hazel"), { ...after, sessionDays: 10 })))).not.toBe("no error");
  });
});

describe("importing a staff list", () => {
  it("adds new people and fills in missing contacts, and nothing else", async () => {
    const file = new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/staff-list-sample.csv")));
    const result = await as(t, "sam", (tx) => importRosterTx(tx, file));
    // Ava Pike (added in the first test, with only an email) gets her mobile number; Juniper is
    // new; Rowan, Felix and Tessa are already there; Wren's row has no usable email.
    expect(result).toEqual({ added: 1, updated: 1, skipped: 1 });
    const [ava] = await rows<{ phone_e164: string }>(t.db, sql`select p.phone_e164 from public.staff_private p where p.email = 'ava.pike@example.org'`);
    expect(ava.phone_e164).toBe("+19165550141");
    const [juniper] = await rows<{ role: string; status: string }>(
      t.db,
      sql`select r.role, s.status from public.staff s join public.staff_roles r on r.staff_id = s.id join public.staff_private p on p.staff_id = s.id where p.email = 'juniper.ortiz@example.org'`,
    );
    expect(juniper).toEqual({ role: "employee", status: "active" });
    // Tessa's name in the file ("Tess Quill") doesn't replace the one on the list.
    const [tessa] = await rows<{ full_name: string }>(t.db, sql`select full_name from public.staff where id = ${staffIdOf("tessa")}::uuid`);
    expect(tessa.full_name).toBe("Tessa Quill");
    expect((await history()).at(-1)?.summary).toBe("Imported a staff list: 1 added, 1 updated, 1 skipped");
    expect(await failure(as(t, "sam", (tx) => importRosterTx(tx, file)))).toBe("There's nobody to add or update in this file.");
  });
});
