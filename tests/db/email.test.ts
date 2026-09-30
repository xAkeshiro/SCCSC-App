import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getCodeProvider } from "@/lib/auth/code-provider";
import { signInCodeEmail } from "@/lib/auth/sign-in-email";
import type { Contact } from "@/lib/contact";
import { createTestDb, type TestDb } from "../support/db";

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
const email = (value: string): Contact => ({ kind: "email", value });
const phone = (value: string): Contact => ({ kind: "phone", value });

describe("sign-in codes by email through Resend", () => {
  it("is used when Resend is set up, and emails every demo code to DEMO_EMAIL_TO", async () => {
    useEmail();
    const provider = getCodeProvider("email");
    expect(provider.channel).toBe("email");
    expect(provider.destinationFor(email("felix.hartwell@example.org"))).toBe("demo.inbox@example.com");

    const calls = fakeResend();
    const sent = await t.db.transaction((tx) => provider.send(tx, email("felix.hartwell@example.org"), { fullName: "Felix Hartwell" }));
    expect(sent).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].auth).toBe("Bearer re_test_key");
    const sentEmail = calls[0].body;
    expect(sentEmail.from).toBe("SCCSC Staff <onboarding@resend.dev>");
    expect(sentEmail.to).toEqual(["demo.inbox@example.com"]);
    expect(sentEmail.subject).toMatch(/^\d{6} is your SCCSC sign-in code$/);
    expect(sentEmail.html).toContain(codeIn(sentEmail));
    expect(sentEmail.html).toContain("Hi Felix");
    expect(sentEmail.html).toContain("fe•••@example.org");
    expect(sentEmail.text).toContain(`sign-in code is: ${codeIn(sentEmail)}`);
  });

  it("the emailed code works once, for what was typed", async () => {
    useEmail();
    const calls = fakeResend();
    const provider = getCodeProvider("email");
    const typed = email("nina.typed@example.org");
    await t.db.transaction((tx) => provider.send(tx, typed));
    const code = codeIn(calls[0].body);

    expect(await t.db.transaction((tx) => provider.verify(tx, typed, "000000"))).toMatchObject({ ok: false });
    expect(await t.db.transaction((tx) => provider.verify(tx, typed, code))).toEqual({ ok: true });
    expect(await t.db.transaction((tx) => provider.verify(tx, typed, code))).toEqual({
      ok: false,
      message: "Please ask for a new code.",
    });
  });

  it("without Twilio, phone sign-in codes go to the demo inbox too (texts cost money)", async () => {
    useEmail();
    const provider = getCodeProvider("phone");
    expect(provider.channel).toBe("email");
    expect(provider.destinationFor(phone("+19165550108"))).toBe("demo.inbox@example.com");
    const calls = fakeResend();
    await t.db.transaction((tx) => provider.send(tx, phone("+19165550108"), { fullName: "Felix Hartwell" }));
    expect(calls[0].body.html).toContain("(•••) •••-0108");
  });

  it("explains a failed send in plain words", async () => {
    useEmail();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeResend(
      { status: 403, body: { name: "validation_error", message: "You can only send testing emails to your own email address" } },
      { status: 429, body: { name: "rate_limit_exceeded" } },
    );
    const provider = getCodeProvider("email");
    expect(await t.db.transaction((tx) => provider.send(tx, email("fails@example.org")))).toEqual({
      ok: false,
      message: "Sign-in emails aren't set up correctly. Please ask the app admin to check the Resend settings.",
    });
    expect(await t.db.transaction((tx) => provider.send(tx, email("fails@example.org")))).toEqual({
      ok: false,
      message: "Too many emails were sent just now. Please wait a minute and try again.",
    });
  });

  it("stops after 5 emails an hour for one address, without calling Resend", async () => {
    useEmail();
    const calls = fakeResend();
    const provider = getCodeProvider("email");
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await t.db.transaction((tx) => provider.send(tx, email("busy@example.org"))));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, message: "Too many codes were sent. Please wait an hour and try again." });
    expect(calls).toHaveLength(5);
  });

  it("needs both settings, and refuses to run once a real database is attached", () => {
    useEmail({ RESEND_API_KEY: "re_test_key" });
    expect(() => getCodeProvider("email")).toThrow(/RESEND_API_KEY and DEMO_EMAIL_TO/);
    useEmail({ ...ENV, DEMO_EMAIL_TO: "not an email" });
    expect(() => getCodeProvider("email")).toThrow(/DEMO_EMAIL_TO must be/);
    useEmail();
    vi.stubEnv("DATABASE_URL", "postgres://example/real");
    expect(() => getCodeProvider("email")).toThrow(/DEMO_EMAIL_TO/);
    expect(() => getCodeProvider("phone")).toThrow(/DEMO_EMAIL_TO/);
  });
});

describe("the sign-in email", () => {
  it("escapes the typed name", () => {
    const { html, text } = signInCodeEmail({
      code: "123456",
      fullName: `<img src=x onerror="alert(1)"> Smith`,
      contactMasked: "(•••) •••-0108",
      demo: true,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; Smith");
    expect(text).toContain("123456");
  });
});
