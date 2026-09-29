import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoCodeProvider } from "@/lib/auth/codes";
import { completeSignIn } from "@/lib/auth/sign-in";
import { createTestDb, rows, sql, staffIdOf, type TestDb } from "../support/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

/** Sends and verifies a code like the sign-in page does, returning the auth user id. */
async function verifyPhone(phone: string) {
  return t.db.transaction(async (tx) => {
    const sent = await demoCodeProvider.send(tx, phone);
    if (!sent.ok || !sent.demoCode) throw new Error("send failed");
    const verified = await demoCodeProvider.verify(tx, phone, sent.demoCode);
    if (!verified.ok) throw new Error(verified.message);
    return verified.userId;
  });
}

describe("verification codes", () => {
  it("rejects a wrong code and counts the tries", async () => {
    await t.db.transaction(async (tx) => {
      const sent = await demoCodeProvider.send(tx, "+19165550150");
      expect(sent.ok).toBe(true);
      const wrong = sent.ok && sent.demoCode === "000000" ? "111111" : "000000";
      const res = await demoCodeProvider.verify(tx, "+19165550150", wrong);
      expect(res).toEqual({ ok: false, message: "That code isn't right. You have 4 more tries." });
    });
  });

  it("a code works only once", async () => {
    await t.db.transaction(async (tx) => {
      const sent = await demoCodeProvider.send(tx, "+19165550151");
      const code = sent.ok ? sent.demoCode! : "";
      expect((await demoCodeProvider.verify(tx, "+19165550151", code)).ok).toBe(true);
      expect((await demoCodeProvider.verify(tx, "+19165550151", code)).ok).toBe(false);
    });
  });

  it("limits how many codes a number can request", async () => {
    await t.db.transaction(async (tx) => {
      for (let i = 0; i < 5; i++) expect((await demoCodeProvider.send(tx, "+19165550152")).ok).toBe(true);
      expect((await demoCodeProvider.send(tx, "+19165550152")).ok).toBe(false);
    });
  });
});

describe("after the phone is verified", () => {
  it("a roster match signs in and links the account", async () => {
    const userId = await verifyPhone("+19165550108");
    const outcome = await t.db.transaction((tx) =>
      completeSignIn(tx, { userId, fullName: "  felix HARTWELL ", phoneE164: "+19165550108" }),
    );
    expect(outcome).toEqual({ kind: "signed-in", staffId: staffIdOf("felix") });
    const [linked] = await rows<{ user_id: string }>(t.db, sql`select user_id from public.staff where id = ${staffIdOf("felix")}::uuid`);
    expect(linked.user_id).toBe(userId);
  });

  it("signing in again goes straight in", async () => {
    const userId = await verifyPhone("+19165550108");
    const outcome = await t.db.transaction((tx) => completeSignIn(tx, { userId, fullName: "Anything", phoneE164: "+19165550108" }));
    expect(outcome.kind).toBe("signed-in");
  });

  it("someone not on the roster waits for approval (once)", async () => {
    const userId = await verifyPhone("+19165550177");
    const first = await t.db.transaction((tx) => completeSignIn(tx, { userId, fullName: "Jamie Newhire", phoneE164: "+19165550177" }));
    const again = await t.db.transaction((tx) => completeSignIn(tx, { userId, fullName: "Jamie Newhire", phoneE164: "+19165550177" }));
    expect(first).toEqual({ kind: "pending" });
    expect(again).toEqual({ kind: "pending" });
    const requests = await rows(t.db, sql`select * from public.access_requests where user_id = ${userId}::uuid`);
    expect(requests).toHaveLength(1);
  });

  it("a roster phone with a different name goes to an admin, noting the match", async () => {
    // Insert a fresh roster entry so this test doesn't depend on the others.
    await t.db.execute(sql`
      with s as (insert into public.staff (full_name, source) values ('Robin Rosterly', 'roster') returning id)
      insert into public.staff_private (staff_id, phone_e164) select id, '+19165550178' from s`);
    const userId = await verifyPhone("+19165550178");
    const outcome = await t.db.transaction((tx) => completeSignIn(tx, { userId, fullName: "Rob Rosterly", phoneE164: "+19165550178" }));
    expect(outcome).toEqual({ kind: "pending" });
    const [req] = await rows<{ matched_staff_id: string | null }>(
      t.db,
      sql`select matched_staff_id from public.access_requests where user_id = ${userId}::uuid`,
    );
    expect(req.matched_staff_id).not.toBeNull();
  });

  it("a rejected request stays rejected", async () => {
    const userId = await verifyPhone("+19165550179");
    await t.db.transaction((tx) => completeSignIn(tx, { userId, fullName: "Pat Stranger", phoneE164: "+19165550179" }));
    await t.db.execute(sql`update public.access_requests set status = 'rejected' where user_id = ${userId}::uuid`);
    const outcome = await t.db.transaction((tx) => completeSignIn(tx, { userId, fullName: "Pat Stranger", phoneE164: "+19165550179" }));
    expect(outcome).toEqual({ kind: "rejected" });
  });

  it("an inactive staff member cannot sign in", async () => {
    await t.db.execute(sql`update public.staff set status = 'inactive' where id = ${staffIdOf("tessa")}::uuid`);
    const userId = await verifyPhone("+19165550102");
    const outcome = await t.db.transaction((tx) => completeSignIn(tx, { userId, fullName: "Tessa Quill", phoneE164: "+19165550102" }));
    expect(outcome).toEqual({ kind: "inactive" });
    await t.db.execute(sql`update public.staff set status = 'active' where id = ${staffIdOf("tessa")}::uuid`);
  });
});
