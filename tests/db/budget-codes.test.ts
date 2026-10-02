import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { userMessage } from "@/db/with-user";
import { importAplosListsTx, saveAccountMappingTx } from "@/lib/data/budget-codes";
import { siteGroups } from "@/lib/data/sites";
import { UserError } from "@/lib/errors";
import { readSettings } from "@/lib/settings";
import { as, createTestDb, queryAs, rows, sql, staffIdOf, type TestDb } from "../support/db";

let t: TestDb;
const template = () => new Uint8Array(readFileSync(path.join(__dirname, "../fixtures/aplos-template-sample.xlsx")));
const failure = (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (err: unknown) => (err instanceof UserError ? err.message : userMessage(err)),
  );

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe("importing budget codes from Aplos", () => {
  it("adds new funds, accounts and schools and updates the rest", async () => {
    // The demo hides one school first: an import must not undo that.
    await t.db.execute(sql`update public.sites set active = false where code = '211'`);
    const summary = await as(t, "sam", (tx) => importAplosListsTx(tx, template()));
    expect(summary.funds).toEqual({ added: 1, updated: 2 });
    expect(summary.accounts).toEqual({ added: 5, updated: 5 });
    expect(summary.sites).toEqual({ added: 4, updated: 2 });
    expect(summary.notInFile).toBe(10);
    expect(summary.warnings).toHaveLength(2);
    const [foothill] = await rows<{ active: boolean; fund_code: string }>(t.db, sql`select active, fund_code from public.sites where code = '211'`);
    expect(foothill).toEqual({ active: false, fund_code: "200" });
    const [added] = await rows<{ name: string; fund_code: string; active: boolean; aplos_name: string }>(
      t.db,
      sql`select name, fund_code, active, aplos_name from public.sites where code = '1266'`,
    );
    expect(added).toEqual({ name: "REGULAR DAY - SAMPLE <ARTS> ACADEMY", fund_code: "200", active: true, aplos_name: "1266  - REGULAR DAY - SAMPLE <ARTS> ACADEMY" });
    await t.db.execute(sql`update public.sites set active = true where code = '211'`);
  });

  it("explains a file that isn't the template", async () => {
    expect(await failure(as(t, "sam", (tx) => importAplosListsTx(tx, new TextEncoder().encode("not a workbook"))))).toMatch(/Excel workbook/);
  });

  it("only admins can change budget codes", async () => {
    expect(await failure(as(t, "hazel", (tx) => importAplosListsTx(tx, template())))).not.toBe("no error");
    const changed = await queryAs(t, "rowan", sql`update public.sites set active = false returning id`);
    expect(changed).toHaveLength(0);
    await expect(queryAs(t, "rowan", sql`insert into public.funds (code, name, aplos_name) values ('5', 'Mine', '5 - Mine')`)).rejects.toThrow();
  });

  it("staff can read funds and schools; accounts are for finance and admins", async () => {
    expect((await queryAs(t, "rowan", sql`select code from public.funds`)).length).toBeGreaterThan(0);
    expect(await queryAs(t, "rowan", sql`select number from public.accounts`)).toHaveLength(0);
    expect((await queryAs(t, "hazel", sql`select number from public.accounts`)).length).toBeGreaterThan(0);
  });
});

describe("the school or site picker", () => {
  it("groups schools by fund, in fund order, and leaves hidden ones out", async () => {
    await t.db.execute(sql`update public.sites set active = false where code = '433'`);
    const groups = await as(t, "rowan", (tx) => siteGroups(tx));
    expect(groups.map((g) => g.fundCode)).toEqual(["1", "100", "200", "300", "400", "999", null]);
    const natomas = groups.find((g) => g.fundCode === "400")!;
    expect(natomas.fundName).toBe("Natomas USD");
    expect(natomas.sites.map((s) => s.code)).toEqual(["431"]);
    const [witter] = await rows<{ id: string }>(t.db, sql`select id from public.sites where code = '433'`);
    const keeping = await as(t, "rowan", (tx) => siteGroups(tx, witter.id));
    expect(keeping.find((g) => g.fundCode === "400")!.sites.map((s) => s.code)).toEqual(["431", "433"]);
    await t.db.execute(sql`update public.sites set active = true where code = '433'`);
  });
});

describe("which account each reimbursement goes to", () => {
  const mapping = { mileageDirect: "5702", mileageIndirect: "5700", parkingDirect: "5703", parkingIndirect: "5701", phone: "5431" };

  it("starts on SCCSC's usual accounts and can be changed by an admin", async () => {
    expect((await as(t, "rowan", (tx) => readSettings(tx))).aplosAccounts.phone).toBe("5430");
    await as(t, "sam", (tx) => saveAccountMappingTx(tx, staffIdOf("sam"), mapping));
    expect((await as(t, "rowan", (tx) => readSettings(tx))).aplosAccounts).toEqual(mapping);
  });

  it("only takes imported accounts", async () => {
    expect(await failure(as(t, "sam", (tx) => saveAccountMappingTx(tx, staffIdOf("sam"), { ...mapping, phone: "9999" })))).toBe(
      "Account 9999 isn't in the imported list.",
    );
  });

  it("can't be changed by someone who isn't an admin", async () => {
    await as(t, "hazel", (tx) => saveAccountMappingTx(tx, staffIdOf("hazel"), { ...mapping, phone: "5430" })).catch(() => null);
    expect((await as(t, "rowan", (tx) => readSettings(tx))).aplosAccounts.phone).toBe("5431");
  });
});
