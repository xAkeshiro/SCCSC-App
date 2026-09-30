import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getCodeProvider } from "@/lib/auth/code-provider";
import { createTestDb, rows, sql, type TestDb } from "../support/db";

let t: TestDb;
const ENV = {
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "secret-token",
  TWILIO_VERIFY_SERVICE_SID: "VAtest",
  DEMO_SMS_TO: "(916) 555-0142",
};

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

function useTwilio(env: Partial<typeof ENV> = ENV) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}

/** Fakes Twilio's API: each call gets the next response. */
function fakeTwilio(...responses: { status: number; body: object }[]) {
  const calls: { url: string; auth: string | null; params: URLSearchParams }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get("authorization"), params: new URLSearchParams(String(init.body)) });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("real texts through Twilio Verify", () => {
  it("is used when Twilio is set up, and sends every demo code to DEMO_SMS_TO", async () => {
    useTwilio();
    const provider = getCodeProvider();
    expect(provider.channel).toBe("sms");
    expect(provider.destinationFor("+19165550108")).toBe("+19165550142");

    const calls = fakeTwilio({ status: 201, body: { status: "pending" } });
    const sent = await t.db.transaction((tx) => provider.send(tx, "+19165550108"));
    expect(sent).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://verify.twilio.com/v2/Services/VAtest/Verifications");
    expect(calls[0].auth).toBe(`Basic ${Buffer.from("ACtest:secret-token").toString("base64")}`);
    expect(Object.fromEntries(calls[0].params)).toEqual({ To: "+19165550142", Channel: "sms" });
  });

  it("an approved code signs in the number that was typed, not the demo phone", async () => {
    useTwilio();
    const calls = fakeTwilio({ status: 200, body: { status: "approved" } });
    const result = await t.db.transaction((tx) => getCodeProvider().verify(tx, "+19165550108", " 123456 "));
    expect(calls[0].url).toBe("https://verify.twilio.com/v2/Services/VAtest/VerificationCheck");
    expect(Object.fromEntries(calls[0].params)).toEqual({ To: "+19165550142", Code: "123456" });
    if (!result.ok) throw new Error(result.message);
    const [user] = await rows<{ phone: string }>(t.db, sql`select phone from auth.users where id = ${result.userId}::uuid`);
    expect(user.phone).toBe("19165550108");
  });

  it("explains wrong, expired and overused codes in plain words", async () => {
    useTwilio();
    fakeTwilio(
      { status: 200, body: { status: "pending" } },
      { status: 404, body: { code: 20404, message: "The requested resource was not found" } },
      { status: 429, body: { code: 60202, message: "Max check attempts reached" } },
    );
    const provider = getCodeProvider();
    const check = () => t.db.transaction((tx) => provider.verify(tx, "+19165550108", "000000"));
    expect(await check()).toEqual({ ok: false, message: "That code isn't right. Please check the text and try again." });
    expect(await check()).toEqual({ ok: false, message: "That code has expired or was already used. Please ask for a new one." });
    expect(await check()).toEqual({ ok: false, message: "Too many tries. Please ask for a new code." });
  });

  it("stops after 5 texts an hour for one number, without calling Twilio", async () => {
    useTwilio();
    const calls = fakeTwilio(...Array.from({ length: 6 }, () => ({ status: 201, body: { status: "pending" } })));
    const provider = getCodeProvider();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await t.db.transaction((tx) => provider.send(tx, "+19165550177")));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, message: "Too many codes were sent to this number. Please wait an hour and try again." });
    expect(calls).toHaveLength(5);
  });

  it("without DEMO_SMS_TO, texts go to the number typed", () => {
    useTwilio({ ...ENV, DEMO_SMS_TO: "" });
    expect(getCodeProvider().destinationFor("+19165550108")).toBe("+19165550108");
  });

  it("refuses to send everything to one phone once a real database is attached", () => {
    useTwilio();
    vi.stubEnv("DATABASE_URL", "postgres://example/real");
    expect(() => getCodeProvider()).toThrow(/DEMO_SMS_TO/);
  });

  it("falls back to showing the code on screen when Twilio isn't set up", () => {
    expect(getCodeProvider().channel).toBe("screen");
  });
});
