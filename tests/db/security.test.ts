import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { userMessage, withUserOn } from "@/db/with-user";
import { as, createTestDb, queryAs, rows, sql, staffIdOf, type TestDb } from "../support/db";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

async function unclaimedItemIds(person: "rowan" | "tessa") {
  const r = await queryAs<{ id: string }>(
    t,
    person,
    sql`select id from public.request_items where owner_id = ${staffIdOf(person)}::uuid and request_id is null order by item_date`,
  );
  return r.map((x) => x.id);
}

function ids(list: string[]) {
  return sql.raw(`array[${list.map((id) => `'${id}'::uuid`).join(",")}]`);
}

describe("reading", () => {
  it("employees see only their own trips", async () => {
    const r = await queryAs<{ owner_id: string }>(t, "rowan", sql`select owner_id from public.request_items`);
    expect(r.length).toBeGreaterThan(0);
    expect(new Set(r.map((x) => x.owner_id))).toEqual(new Set([staffIdOf("rowan")]));
  });

  it("phone numbers are admin-only", async () => {
    expect(await queryAs(t, "rowan", sql`select * from public.staff_private`)).toHaveLength(0);
    expect(await queryAs(t, "lena", sql`select * from public.staff_private`)).toHaveLength(0);
    expect(await queryAs(t, "hazel", sql`select * from public.staff_private`)).toHaveLength(0);
    expect((await queryAs(t, "sam", sql`select * from public.staff_private`)).length).toBeGreaterThanOrEqual(8);
  });

  it("coordinators see their team's claims, not other teams'", async () => {
    const r = await queryAs<{ owner_id: string }>(t, "lena", sql`select owner_id from public.requests`);
    const owners = new Set(r.map((x) => x.owner_id));
    expect(owners).toContain(staffIdOf("rowan"));
    expect(owners).toContain(staffIdOf("tessa"));
    expect(owners).toContain(staffIdOf("lena")); // her own
    expect(owners).not.toContain(staffIdOf("marcus"));
  });

  it("finance sees approved, batched and paid claims only (plus their own)", async () => {
    const r = await queryAs<{ owner_id: string; status: string }>(t, "hazel", sql`select owner_id, status from public.requests`);
    for (const row of r) {
      if (row.owner_id === staffIdOf("hazel")) continue;
      expect(["approved", "batched", "paid"]).toContain(row.status);
    }
    expect(r.some((x) => x.owner_id === staffIdOf("rowan"))).toBe(true);
  });

  it("reviewers see 'Home' but not the home address; the owner sees it", async () => {
    const forLena = await queryAs<{ from_label: string; from_address: string | null; involves_home: boolean }>(
      t,
      "lena",
      sql`select from_label, from_address, involves_home from public.trip_view where owner_id = ${staffIdOf("tessa")}::uuid and from_is_home`,
    );
    expect(forLena).toHaveLength(1);
    expect(forLena[0]).toMatchObject({ from_label: "Home", from_address: null, involves_home: true });

    const forTessa = await queryAs<{ from_address: string | null }>(
      t,
      "tessa",
      sql`select from_address from public.trip_view where from_is_home`,
    );
    expect(forTessa[0].from_address).toMatch(/Demo|Fiction|Sample/);
  });

  it("the mileage_details table itself is owner-only", async () => {
    const r = await queryAs(
      t,
      "lena",
      sql`select d.* from public.mileage_details d join public.request_items i on i.id = d.item_id where i.owner_id = ${staffIdOf("tessa")}::uuid`,
    );
    expect(r).toHaveLength(0);
  });

  it("an account with no active staff record sees nothing", async () => {
    const r = await queryAs(t, "nora", sql`select * from public.requests`);
    expect(r).toHaveLength(0);
    const own = await queryAs<{ status: string }>(t, "nora", sql`select status from public.access_requests`);
    expect(own).toEqual([{ status: "pending" }]);
  });
});

describe("the claim lifecycle", () => {
  let claimId: string;

  it("an employee submits unclaimed trips as a claim", async () => {
    const items = await unclaimedItemIds("rowan");
    expect(items.length).toBe(2);
    const [{ id }] = await queryAs<{ id: string }>(t, "rowan", sql`select app.submit_claim(${ids(items)}, 'Two trips') as id`);
    claimId = id;
    const [claim] = await queryAs<{ status: string; total_cents: number }>(
      t,
      "rowan",
      sql`select status, total_cents from public.requests where id = ${claimId}::uuid`,
    );
    expect(claim.status).toBe("submitted");
    const [{ sum }] = await queryAs<{ sum: number }>(
      t,
      "rowan",
      sql`select sum(amount_cents)::int as sum from public.request_items where request_id = ${claimId}::uuid`,
    );
    expect(claim.total_cents).toBe(sum);
    const events = await queryAs<{ action: string; actor_name: string }>(
      t,
      "rowan",
      sql`select action, actor_name from public.request_events where request_id = ${claimId}::uuid`,
    );
    expect(events).toEqual([{ action: "submitted", actor_name: "Rowan Ellery" }]);
  });

  it("trips in a submitted claim are locked", async () => {
    // For the employee, RLS hides locked trips from UPDATE/DELETE: nothing changes.
    const updated = await queryAs(
      t,
      "rowan",
      sql`update public.request_items set purpose = 'changed' where request_id = ${claimId}::uuid returning id`,
    );
    expect(updated).toHaveLength(0);
    const deleted = await queryAs(t, "rowan", sql`delete from public.request_items where request_id = ${claimId}::uuid returning id`);
    expect(deleted).toHaveLength(0);
    // Even code running as the database owner is stopped by the lock trigger.
    const locked = (e: unknown) => /locked/.test(userMessage(e));
    await expect(
      t.db.execute(sql`update public.request_items set purpose = 'changed' where request_id = ${claimId}::uuid`),
    ).rejects.toSatisfy(locked);
    await expect(
      t.db.execute(
        sql`update public.mileage_details set miles = 999 where item_id in (select id from public.request_items where request_id = ${claimId}::uuid)`,
      ),
    ).rejects.toSatisfy(locked);
  });

  it("nobody can approve their own claim, and only the right coordinator can", async () => {
    await expect(queryAs(t, "rowan", sql`select app.decide_claim(${claimId}::uuid, 'approve', null)`)).rejects.toThrow();
    await expect(queryAs(t, "owen", sql`select app.decide_claim(${claimId}::uuid, 'approve', null)`)).rejects.toThrow();
    await expect(queryAs(t, "hazel", sql`select app.decide_claim(${claimId}::uuid, 'approve', null)`)).rejects.toThrow();
  });

  it("returning or denying needs a comment", async () => {
    await expect(queryAs(t, "lena", sql`select app.decide_claim(${claimId}::uuid, 'return', '  ')`)).rejects.toThrow();
  });

  it("returned claims can be edited and resubmitted", async () => {
    await queryAs(t, "lena", sql`select app.decide_claim(${claimId}::uuid, 'return', 'Please add the program note')`);
    await as(t, "rowan", (tx) =>
      tx.execute(sql`update public.request_items set notes = 'Added note' where request_id = ${claimId}::uuid`),
    );
    const items = await queryAs<{ id: string }>(t, "rowan", sql`select id from public.request_items where request_id = ${claimId}::uuid`);
    await queryAs(t, "rowan", sql`select app.resubmit_claim(${claimId}::uuid, ${ids(items.map((i) => i.id))}, null)`);
    const [claim] = await queryAs<{ status: string }>(t, "rowan", sql`select status from public.requests where id = ${claimId}::uuid`);
    expect(claim.status).toBe("submitted");
  });

  it("the coordinator approves, and approved trips are locked", async () => {
    await queryAs(t, "lena", sql`select app.decide_claim(${claimId}::uuid, 'approve', null)`);
    const updated = await queryAs(
      t,
      "rowan",
      sql`update public.request_items set notes = 'x' where request_id = ${claimId}::uuid returning id`,
    );
    expect(updated).toHaveLength(0);
    const history = await queryAs<{ action: string }>(
      t,
      "rowan",
      sql`select action from public.request_events where request_id = ${claimId}::uuid order by id`,
    );
    expect(history.map((h) => h.action)).toEqual(["submitted", "returned", "resubmitted", "approved"]);
  });

  it("finance batches the claim, exports and marks it paid", async () => {
    await expect(
      queryAs(t, "rowan", sql`select app.create_batch(current_date - 14, current_date, ${ids([claimId])}, null)`),
    ).rejects.toThrow();
    const [{ id: batchId }] = await queryAs<{ id: string }>(
      t,
      "hazel",
      sql`select app.create_batch(current_date - 14, current_date, ${ids([claimId])}, null) as id`,
    );
    await queryAs(t, "hazel", sql`select app.mark_batch_exported(${batchId}::uuid)`);
    await expect(queryAs(t, "hazel", sql`select app.remove_from_batch(${claimId}::uuid)`)).rejects.toThrow(); // frozen once exported
    await queryAs(t, "hazel", sql`select app.mark_batch_paid(${batchId}::uuid, current_date)`);
    const [claim] = await queryAs<{ status: string }>(t, "rowan", sql`select status from public.requests where id = ${claimId}::uuid`);
    expect(claim.status).toBe("paid");
    const batches = await queryAs<{ id: string }>(t, "rowan", sql`select id from public.batches where id = ${batchId}::uuid`);
    expect(batches).toHaveLength(1);
  });
});

describe("tampering", () => {
  it("signed-in users cannot change statuses or claim membership directly", async () => {
    await expect(
      as(t, "rowan", (tx) => tx.execute(sql`update public.requests set status = 'approved' where owner_id = ${staffIdOf("rowan")}::uuid`)),
    ).rejects.toThrow();
    await expect(
      as(t, "rowan", (tx) => tx.execute(sql`update public.request_items set request_id = null where owner_id = ${staffIdOf("rowan")}::uuid`)),
    ).rejects.toThrow();
  });

  it("new trips cannot be slipped into an existing claim", async () => {
    const [claim] = await queryAs<{ id: string }>(t, "rowan", sql`select id from public.requests where status = 'approved' limit 1`);
    await expect(
      as(t, "rowan", (tx) =>
        tx.execute(sql`insert into public.request_items (request_type, owner_id, request_id, item_date, purpose, amount_cents)
                       values ('mileage', ${staffIdOf("rowan")}::uuid, ${claim.id}::uuid, current_date, 'sneaky', 100)`),
      ),
    ).rejects.toThrow();
  });

  it("nobody can write trips for someone else", async () => {
    await expect(
      as(t, "rowan", (tx) =>
        tx.execute(sql`insert into public.request_items (request_type, owner_id, item_date, purpose, amount_cents)
                       values ('mileage', ${staffIdOf("tessa")}::uuid, current_date, 'not mine', 100)`),
      ),
    ).rejects.toThrow();
  });

  it("the history is append-only, even for the database owner", async () => {
    await expect(t.db.execute(sql`update public.request_events set comment = 'edited'`)).rejects.toThrow();
    await expect(t.db.execute(sql`delete from public.request_events`)).rejects.toThrow();
  });

  it("only admins manage roles", async () => {
    await expect(
      as(t, "lena", (tx) => tx.execute(sql`insert into public.staff_roles (staff_id, role) values (${staffIdOf("lena")}::uuid, 'admin')`)),
    ).rejects.toThrow();
    await withUserOn(t.db, "00000000-0000-4000-9000-000000000107", (tx) =>
      tx.execute(sql`insert into public.staff_roles (staff_id, role) values (${staffIdOf("felix")}::uuid, 'coordinator')`),
    );
    const r = await rows<{ role: string }>(t.db, sql`select role from public.staff_roles where staff_id = ${staffIdOf("felix")}::uuid order by role`);
    expect(r.map((x) => x.role)).toEqual(["employee", "coordinator"]);
  });
});

describe("the demo seed", () => {
  it("uses the same ids every time, so demo links work on any server instance", async () => {
    const other = await createTestDb();
    try {
      const q = sql`select id, ref from public.requests order by ref`;
      const a = await rows<{ id: string; ref: number }>(t.db, q);
      const b = await rows<{ id: string; ref: number }>(other.db, q);
      // Compare only the seeded claims (tests above add more).
      expect(a.slice(0, b.length)).toEqual(b);
      expect(b.every((r) => r.id.startsWith("00000000-0000-4000-a000-"))).toBe(true);
    } finally {
      await other.close();
    }
  });
});
