import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getCodeProvider } from "@/lib/auth/code-provider";
import { maskEmail } from "@/lib/auth/email";
import { signInCodeEmail } from "@/lib/auth/sign-in-email";
import { createTestDb, rows, sql, type TestDb } from "../support/db";

let t: TestDb;
const ENV = { RESEND_API_KEY: "re_test_key", DEMO_EMAIL_TO: "demo.inbox@example.com" };

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function useEmail(env: Record<string, string> = ENV) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}

type Sent = { from: string; to: string[]; subject: string; html: string; text: string };

/** Fakes Resend's API: each call gets the next response. */
function fakeResend(...responses: { status: number; body?: object }[]) {
  const calls: { url: string; auth: string | null; body: Sent }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
      const next = responses.shift() ?? { status: 200, body: { id: "email_1" } };
      return new Response(JSON.stringify(next.body ?? {}), { status: next.status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const codeIn = (email: Sent) => email.subject.match(/^(\d{6}) /)?.[1] ?? "";

describe("sign-in codes by email through Resend", () => {
  it("is used when Resend is set up, and emails every demo code to DEMO_EMAIL_TO", async () => {
    useEmail();
    const provider = getCodeProvider();
    expect(provider.channel).toBe("email");
    expect(provider.destinationFor("+19165550108")).toBe("demo.inbox@example.com");

    const calls = fakeResend();
    const sent = await t.db.transaction((tx) => provider.send(tx, "+19165550108", { fullName: "Felix Hartwell" }));
    expect(sent).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].auth).toBe("Bearer re_test_key");
    const email = calls[0].body;
    expect(email.from).toBe("SCCSC Staff <onboarding@resend.dev>");
    expect(email.to).toEqual(["demo.inbox@example.com"]);
    expect(email.subject).toMatch(/^\d{6} is your SCCSC sign-in code$/);
    expect(email.html).toContain(codeIn(email));
    expect(email.html).toContain("Hi Felix");
    expect(email.html).toContain("(•••) •••-0108");
    expect(email.text).toContain(`sign-in code is: ${codeIn(email)}`);
  });

  it("the emailed code signs in the number that was typed, once", async () => {
    useEmail();
    const calls = fakeResend();
    const provider = getCodeProvider();
    await t.db.transaction((tx) => provider.send(tx, "+19165550109"));
    const code = codeIn(calls[0].body);

    expect(await t.db.transaction((tx) => provider.verify(tx, "+19165550109", "000000"))).toMatchObject({ ok: false });
    const result = await t.db.transaction((tx) => provider.verify(tx, "+19165550109", code));
    if (!result.ok) throw new Error(result.message);
    const [user] = await rows<{ phone: string }>(t.db, sql`select phone from auth.users where id = ${result.userId}::uuid`);
    expect(user.phone).toBe("19165550109");
    expect(await t.db.transaction((tx) => provider.verify(tx, "+19165550109", code))).toEqual({
      ok: false,
      message: "Please ask for a new code.",
    });
  });

  it("explains a failed send in plain words", async () => {
    useEmail();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeResend(
      { status: 403, body: { name: "validation_error", message: "You can only send testing emails to your own email address" } },
      { status: 429, body: { name: "rate_limit_exceeded" } },
    );
    const provider = getCodeProvider();
    expect(await t.db.transaction((tx) => provider.send(tx, "+19165550110"))).toEqual({
      ok: false,
      message: "Sign-in emails aren't set up correctly. Please ask the app admin to check the Resend settings.",
    });
    expect(await t.db.transaction((tx) => provider.send(tx, "+19165550110"))).toEqual({
      ok: false,
      message: "Too many emails were sent just now. Please wait a minute and try again.",
    });
  });

  it("stops after 5 emails an hour for one number, without calling Resend", async () => {
    useEmail();
    const calls = fakeResend();
    const provider = getCodeProvider();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await t.db.transaction((tx) => provider.send(tx, "+19165550178")));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, message: "Too many codes were sent to this number. Please wait an hour and try again." });
    expect(calls).toHaveLength(5);
  });

  it("needs both settings, and refuses to run once a real database is attached", () => {
    useEmail({ RESEND_API_KEY: "re_test_key" });
    expect(() => getCodeProvider()).toThrow(/RESEND_API_KEY and DEMO_EMAIL_TO/);
    useEmail({ ...ENV, DEMO_EMAIL_TO: "not an email" });
    expect(() => getCodeProvider()).toThrow(/DEMO_EMAIL_TO must be/);
    useEmail();
    vi.stubEnv("DATABASE_URL", "postgres://example/real");
    expect(() => getCodeProvider()).toThrow(/DEMO_EMAIL_TO/);
  });
});

describe("the sign-in email", () => {
  it("escapes the typed name", () => {
    const { html, text } = signInCodeEmail({
      code: "123456",
      fullName: `<img src=x onerror="alert(1)"> Smith`,
      phoneMasked: "(•••) •••-0108",
      demo: true,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; Smith");
    expect(text).toContain("123456");
  });

  it("masks the demo inbox on screen", () => {
    expect(maskEmail("demo.inbox@example.com")).toBe("de•••@example.com");
    expect(maskEmail("a@example.com")).toBe("a•••@example.com");
  });
});
