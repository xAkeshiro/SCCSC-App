import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { batchDetailTx } from "@/lib/data/finance";
import { as, createTestDb, rows, sql, staffIdOf, type TestDb } from "../support/db";

let t: TestDb;
let paidBatch: string;

beforeAll(async () => {
  t = await createTestDb();
  [{ id: paidBatch }] = await rows<{ id: string }>(t.db, sql`select id from public.batches where status = 'paid' limit 1`);
});
afterAll(async () => {
  await t.close();
});

describe("payments for Aplos", () => {
  it("makes one payment per person in a batch, split by budget code", async () => {
    const batch = (await as(t, "hazel", (tx) => batchDetailTx(tx, paidBatch)))!;
    // The paid demo batch has Rowan's mileage and phone bill, and Hazel's mileage.
    expect(batch.payments.map((p) => p.payee)).toEqual(["Hazel Brightwater", "Rowan Ellery"]);
    const rowan = batch.payments[1];
    expect(rowan.memo).toMatch(/^MIL\d{6}, CELL\d{6}$/);
    expect(rowan.lines.some((l) => l.kind === "phone" && l.budgetCode === "5430-200-211")).toBe(true);
    for (const p of batch.payments) {
      for (const l of p.lines) {
        expect(l.budgetCode).toMatch(/^\d{4}-\d+-\d+$/);
        expect(l.problems).toEqual([]);
      }
    }
    expect(batch.payments.reduce((n, p) => n + p.totalCents, 0)).toBe(batch.totalCents);
    expect(batch.aplosNames.accounts.get("5430")).toMatch(/^5430 - /);
  });

  it("uses each person's name in Aplos when it's set", async () => {
    await t.db.execute(sql`update public.staff set aplos_name = 'Ellery, Rowan' where id = ${staffIdOf("rowan")}::uuid`);
    const batch = (await as(t, "hazel", (tx) => batchDetailTx(tx, paidBatch)))!;
    expect(batch.payments.map((p) => p.payee)).toEqual(["Ellery, Rowan", "Hazel Brightwater"]);
  });

  it("follows the account choices in settings", async () => {
    await t.db.execute(sql`update public.settings set value = '{"phone": "5431"}'::jsonb where key = 'aplos_accounts'`);
    const batch = (await as(t, "hazel", (tx) => batchDetailTx(tx, paidBatch)))!;
    const phone = batch.payments.flatMap((p) => p.lines).filter((l) => l.kind === "phone");
    expect(phone.length).toBeGreaterThan(0);
    expect(phone.every((l) => l.account === "5431")).toBe(true);
  });

  it("shows an employee only their own payment", async () => {
    // Rowan can see the batch his claims were paid in, but not anyone else's claims in it.
    const mine = (await as(t, "rowan", (tx) => batchDetailTx(tx, paidBatch)))!;
    expect(mine.payments.map((p) => p.ownerId)).toEqual([staffIdOf("rowan")]);
    expect(await as(t, "marcus", (tx) => batchDetailTx(tx, paidBatch))).toBeNull();
  });
});
