import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { userMessage } from "@/db/with-user";
import { claimPhoneMonths, phoneOverviewFor, resubmitPhoneMonths } from "@/lib/data/phone";
import { UserError } from "@/lib/errors";
import { as, createTestDb, queryAs, rows, sql, staffIdOf, type TestDb } from "../support/db";

// A fixed "today", so the open periods don't depend on when the tests run: September–October 2026
// is open, and July–August can still be claimed. Hazel has no phone claims in the demo seed.
const TODAY = "2026-10-15";

let t: TestDb;
let adm: string;

beforeAll(async () => {
  t = await createTestDb();
  adm = (await rows<{ id: string }>(t.db, sql`select id from public.programs where code = 'ADM'`))[0].id;
});
afterAll(async () => {
  await t.close();
});

const claim = (months: string[], person: "hazel" | "sam" = "hazel") =>
  as(t, person, (tx) => claimPhoneMonths(tx, staffIdOf(person), { months, programId: adm, note: "" }, TODAY));

const failure = (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (err: unknown) => (err instanceof UserError ? err.message : userMessage(err)),
  );

describe("claiming a phone bill", () => {
  let hazelClaim: string;

  it("offers the open period at $45 a month", async () => {
    const o = await as(t, "hazel", (tx) => phoneOverviewFor(tx, staffIdOf("hazel"), null, TODAY));
    expect(o.rateCents).toBe("4500.00");
    expect(o.periods.map((p) => p.period.label)).toEqual(["September–October 2026", "July–August 2026"]);
    expect(o.periods[0].months.map((m) => [m.month, m.amountCents, m.claim])).toEqual([
      ["2026-09-01", 4500, null],
      ["2026-10-01", 4500, null],
    ]);
    expect(o.next.label).toBe("November–December 2026");
  });

  it("claims both months as one $90 claim, sent for approval", async () => {
    hazelClaim = await claim(["2026-10-01", "2026-09-01"]);
    const [req] = await rows<{ request_type: string; status: string; total_cents: number }>(
      t.db,
      sql`select request_type, status, total_cents from public.requests where id = ${hazelClaim}::uuid`,
    );
    expect(req).toEqual({ request_type: "phone", status: "submitted", total_cents: 9000 });
    const months = await rows<{ month: string; rate_cents: string; amount_cents: number; purpose: string }>(
      t.db,
      sql`select d.month::text, d.rate_cents::text, i.amount_cents, i.purpose
          from public.request_items i join public.phone_details d on d.item_id = i.id
          where i.request_id = ${hazelClaim}::uuid order by d.month`,
    );
    expect(months).toEqual([
      { month: "2026-09-01", rate_cents: "4500.00", amount_cents: 4500, purpose: "Phone bill, September 2026" },
      { month: "2026-10-01", rate_cents: "4500.00", amount_cents: 4500, purpose: "Phone bill, October 2026" },
    ]);
  });

  it("a month can only be claimed once", async () => {
    expect(await failure(claim(["2026-10-01"]))).toBe("You've already claimed October 2026.");
    // The database refuses it too, even without the app's check.
    const direct = as(t, "hazel", async (tx) => {
      const [item] = await rows<{ id: string }>(
        tx,
        sql`insert into public.request_items (request_type, owner_id, item_date, purpose, amount_cents)
            values ('phone', ${staffIdOf("hazel")}::uuid, '2026-10-01', 'Again', 4500) returning id`,
      );
      await tx.execute(
        sql`insert into public.phone_details (item_id, owner_id, month, rate_cents) values (${item.id}::uuid, ${staffIdOf("hazel")}::uuid, '2026-10-01', 4500)`,
      );
    });
    await expect(direct).rejects.toThrow();
  });

  it("refuses months that aren't open yet or are too far back", async () => {
    expect(await failure(claim(["2026-11-01"], "sam"))).toBe("November 2026 can't be claimed right now.");
    expect(await failure(claim(["2026-05-01"], "sam"))).toBe("May 2026 can't be claimed right now.");
  });

  it("only the owner and their approver see it", async () => {
    const seen = (person: "tessa" | "owen" | "hazel") =>
      queryAs(t, person, sql`select d.item_id from public.phone_details d where d.owner_id = ${staffIdOf("hazel")}::uuid`);
    expect(await seen("tessa")).toHaveLength(0);
    expect(await seen("owen")).toHaveLength(2);
    expect(await seen("hazel")).toHaveLength(2);
  });

  it("nobody can put a month on someone else's name", async () => {
    const forged = as(t, "sam", async (tx) => {
      const [item] = await rows<{ id: string }>(
        tx,
        sql`insert into public.request_items (request_type, owner_id, item_date, purpose, amount_cents)
            values ('phone', ${staffIdOf("sam")}::uuid, '2026-09-01', 'Mine', 4500) returning id`,
      );
      await tx.execute(
        sql`insert into public.phone_details (item_id, owner_id, month, rate_cents) values (${item.id}::uuid, ${staffIdOf("hazel")}::uuid, '2026-08-01', 4500)`,
      );
    });
    await expect(forged).rejects.toThrow();
  });

  it("months in a submitted claim are locked, even for owner-level code", async () => {
    const hidden = await queryAs(t, "hazel", sql`delete from public.phone_details where owner_id = ${staffIdOf("hazel")}::uuid returning item_id`);
    expect(hidden).toHaveLength(0);
    await expect(t.db.execute(sql`delete from public.phone_details where owner_id = ${staffIdOf("hazel")}::uuid`)).rejects.toThrow();
  });

  it("a returned claim can drop a month and be resubmitted, and the month can be claimed later", async () => {
    await as(t, "owen", (tx) => tx.execute(sql`select app.decide_claim(${hazelClaim}::uuid, 'return', 'You started in October.')`));
    const items = await rows<{ id: string; month: string }>(
      t.db,
      sql`select i.id, d.month::text from public.request_items i join public.phone_details d on d.item_id = i.id
          where i.request_id = ${hazelClaim}::uuid order by d.month`,
    );
    const october = items.find((i) => i.month === "2026-10-01")!.id;
    await as(t, "hazel", (tx) => resubmitPhoneMonths(tx, staffIdOf("hazel"), hazelClaim, [october], "October only"));
    const [req] = await rows<{ status: string; total_cents: number }>(
      t.db,
      sql`select status, total_cents from public.requests where id = ${hazelClaim}::uuid`,
    );
    expect(req).toEqual({ status: "submitted", total_cents: 4500 });
    expect(await failure(claim(["2026-09-01"]))).toBe("no error");
  });

  it("a withdrawn claim can't lose all its months", async () => {
    const id = await claim(["2026-07-01"]);
    await as(t, "hazel", (tx) => tx.execute(sql`select app.withdraw_claim(${id}::uuid)`));
    expect(await failure(as(t, "hazel", (tx) => resubmitPhoneMonths(tx, staffIdOf("hazel"), id, [], "")))).toBe("Keep at least one month.");
  });
});
