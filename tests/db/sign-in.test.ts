import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoCodeProvider } from "@/lib/auth/codes";
import { completeSignIn, signInAccount } from "@/lib/auth/sign-in";
import type { Contact } from "@/lib/contact";
import { createTestDb, rows, sql, staffIdOf, userIdOf, type TestDb } from "../support/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const email = (value: string): Contact => ({ kind: "email", value });
const phone = (value: string): Contact => ({ kind: "phone", value });

/** Sends and checks a code like the sign-in page does, then signs in. Returns the account and outcome. */
async function signIn(contact: Contact, fullName: string) {
  return t.db.transaction(async (tx) => {
    const sent = await demoCodeProvider.send(tx, contact);
    if (!sent.ok || !sent.demoCode) throw new Error("send failed");
    const verified = await demoCodeProvider.verify(tx, contact, sent.demoCode);
    if (!verified.ok) throw new Error(verified.message);
    const userId = await signInAccount(tx, contact, fullName);
    return { userId, outcome: await completeSignIn(tx, { userId, fullName, contact }) };
  });
}

describe("verification codes", () => {
  it("rejects a wrong code and counts the tries", async () => {
    await t.db.transaction(async (tx) => {
      const sent = await demoCodeProvider.send(tx, email("wrong.code@example.org"));
      expect(sent.ok).toBe(true);
      const wrong = sent.ok && sent.demoCode === "000000" ? "111111" : "000000";
      const res = await demoCodeProvider.verify(tx, email("wrong.code@example.org"), wrong);
      expect(res).toEqual({ ok: false, message: "That code isn't right. You have 4 more tries." });
    });
  });

  it("a code works only once, and only for what it was sent to", async () => {
    await t.db.transaction(async (tx) => {
      const sent = await demoCodeProvider.send(tx, phone("+19165550151"));
      const code = sent.ok ? sent.demoCode! : "";
      expect((await demoCodeProvider.verify(tx, email("someone.else@example.org"), code)).ok).toBe(false);
      expect((await demoCodeProvider.verify(tx, phone("+19165550151"), code)).ok).toBe(true);
      expect((await demoCodeProvider.verify(tx, phone("+19165550151"), code)).ok).toBe(false);
    });
  });

  it("limits how many codes an email or number can request", async () => {
    await t.db.transaction(async (tx) => {
      for (let i = 0; i < 5; i++) expect((await demoCodeProvider.send(tx, email("lots@example.org"))).ok).toBe(true);
      expect(await demoCodeProvider.send(tx, email("lots@example.org"))).toEqual({
        ok: false,
        message: "Too many codes were sent. Please wait an hour and try again.",
      });
    });
  });
});

describe("after the email or phone is verified", () => {
  it("a roster match by email signs in and links the account", async () => {
    const { userId, outcome } = await signIn(email("felix.hartwell@example.org"), "  felix HARTWELL ");
    expect(outcome).toEqual({ kind: "signed-in", staffId: staffIdOf("felix") });
    const [linked] = await rows<{ user_id: string }>(t.db, sql`select user_id from public.staff where id = ${staffIdOf("felix")}::uuid`);
    expect(linked.user_id).toBe(userId);
  });

  it("signing in again goes straight in", async () => {
    const { outcome } = await signIn(email("felix.hartwell@example.org"), "Anything");
    expect(outcome.kind).toBe("signed-in");
  });

  it("the same person can switch to their phone, and keeps one account", async () => {
    const byEmail = await signIn(email("felix.hartwell@example.org"), "Felix Hartwell");
    const byPhone = await signIn(phone("+19165550108"), "Felix Hartwell");
    expect(byPhone.outcome).toEqual({ kind: "signed-in", staffId: staffIdOf("felix") });
    expect(byPhone.userId).toBe(byEmail.userId);
    const [account] = await rows<{ email: string; phone: string }>(
      t.db,
      sql`select email, phone from auth.users where id = ${byEmail.userId}::uuid`,
    );
    expect(account).toEqual({ email: "felix.hartwell@example.org", phone: "19165550108" });
  });

  it("seeded people can use either their email or their phone", async () => {
    expect((await signIn(email("rowan.ellery@example.org"), "Rowan Ellery")).userId).toBe(userIdOf("rowan"));
    expect((await signIn(phone("+19165550101"), "Rowan Ellery")).userId).toBe(userIdOf("rowan"));
  });

  it("a roster phone only joins its owner's account when the name matches", async () => {
    // Dana has signed in by email; their phone is on the roster but hasn't been used yet.
    await t.db.execute(sql`
      with u as (insert into auth.users (email) values ('dana.linkwell@example.org') returning id),
           s as (insert into public.staff (full_name, source, user_id) select 'Dana Linkwell', 'roster', id from u returning id)
      insert into public.staff_private (staff_id, email, phone_e164) select id, 'dana.linkwell@example.org', '+19165550181' from s`);
    const [dana] = await rows<{ id: string }>(t.db, sql`select id from auth.users where email = 'dana.linkwell@example.org'`);

    const { userId, outcome } = await signIn(phone("+19165550181"), "Someone Else");
    expect(userId).not.toBe(dana.id);
    expect(outcome).toEqual({ kind: "pending" });
  });

  it("someone not on the roster waits for approval (once)", async () => {
    const first = await signIn(email("jamie.newhire@example.org"), "Jamie Newhire");
    const again = await signIn(email("jamie.newhire@example.org"), "Jamie Newhire");
    expect(first.outcome).toEqual({ kind: "pending" });
    expect(again.outcome).toEqual({ kind: "pending" });
    const requests = await rows<{ email: string; phone_e164: string | null }>(
      t.db,
      sql`select email, phone_e164 from public.access_requests where user_id = ${first.userId}::uuid`,
    );
    expect(requests).toEqual([{ email: "jamie.newhire@example.org", phone_e164: null }]);
  });

  it("a roster email or phone with a different name goes to an admin, noting the match", async () => {
    // Insert a fresh roster entry so this test doesn't depend on the others.
    await t.db.execute(sql`
      with s as (insert into public.staff (full_name, source) values ('Robin Rosterly', 'roster') returning id)
      insert into public.staff_private (staff_id, email, phone_e164) select id, 'robin.r@example.org', '+19165550178' from s`);
    for (const contact of [email("robin.r@example.org"), phone("+19165550178")]) {
      const { userId, outcome } = await signIn(contact, "Rob Rosterly");
      expect(outcome).toEqual({ kind: "pending" });
      const [req] = await rows<{ matched_staff_id: string | null }>(
        t.db,
        sql`select matched_staff_id from public.access_requests where user_id = ${userId}::uuid`,
      );
      expect(req.matched_staff_id).not.toBeNull();
    }
  });

  it("a rejected request stays rejected", async () => {
    const { userId } = await signIn(phone("+19165550179"), "Pat Stranger");
    await t.db.execute(sql`update public.access_requests set status = 'rejected' where user_id = ${userId}::uuid`);
    const { outcome } = await signIn(phone("+19165550179"), "Pat Stranger");
    expect(outcome).toEqual({ kind: "rejected" });
  });

  it("an inactive staff member cannot sign in", async () => {
    await t.db.execute(sql`update public.staff set status = 'inactive' where id = ${staffIdOf("tessa")}::uuid`);
    const { outcome } = await signIn(email("tessa.quill@example.org"), "Tessa Quill");
    expect(outcome).toEqual({ kind: "inactive" });
    await t.db.execute(sql`update public.staff set status = 'active' where id = ${staffIdOf("tessa")}::uuid`);
  });
});
