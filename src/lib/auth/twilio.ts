/**
 * Real sign-in texts through Twilio Verify (https://www.twilio.com/docs/verify/api).
 * Twilio makes the 6-digit code, texts it and checks it, so there's no phone number to buy or
 * carrier registration to do. A trial account can text the phone numbers verified on it.
 *
 * Environment (see .env.example):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
 *   DEMO_SMS_TO  demo only: every code goes to this phone, whatever number was typed. The typed
 *                number still decides who signs in.
 */
import type { Tx } from "@/db";
import type { Contact } from "@/lib/contact";
import { normalizeUsPhone } from "@/lib/phone";
import { MAX_DELIVERIES_PER_HOUR_TOTAL, MAX_SENDS_PER_HOUR, TOO_MANY_SENDS, allowSend, type CodeProvider } from "./codes";

export type TwilioConfig = { accountSid: string; authToken: string; serviceSid: string; demoTo: string | null };

/** Twilio settings from the environment, or null when texts aren't set up. */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) return null;
  const rawDemoTo = process.env.DEMO_SMS_TO?.trim();
  const demoTo = rawDemoTo ? normalizeUsPhone(rawDemoTo) : null;
  if (rawDemoTo && !demoTo) throw new Error("DEMO_SMS_TO must be a 10-digit US mobile number, like +19165551234.");
  return { accountSid, authToken, serviceSid, demoTo };
}

type TwilioResult = { ok: true; data: { status?: string } } | { ok: false; status: number; code: number | null };

async function verifyApi(cfg: TwilioConfig, path: "Verifications" | "VerificationCheck", params: Record<string, string>): Promise<TwilioResult> {
  let res: Response;
  try {
    res = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(cfg.serviceSid)}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`Twilio Verify ${path}: request failed`, err instanceof Error ? err.message : err);
    return { ok: false, status: 0, code: null };
  }
  const data = (await res.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };
  if (!res.ok) {
    // Twilio's message helps whoever reads the logs; people see a plain-language one instead.
    console.error(`Twilio Verify ${path}: ${res.status} ${data.code ?? ""} ${data.message ?? ""}`);
    return { ok: false, status: res.status, code: typeof data.code === "number" ? data.code : null };
  }
  return { ok: true, data };
}

function sendError(code: number | null): string {
  switch (code) {
    case 60203: // max send attempts to this number
      return "Too many codes were sent. Please wait 10 minutes and try again.";
    case 21608: // trial account: number not verified
    case 21614:
      return "Texts can't go to that phone yet. On a Twilio trial, the phone must be verified in Twilio first.";
    case 20003: // bad credentials
      return "Text messages aren't set up correctly. Please ask the app admin to check the Twilio settings.";
    default:
      return "We couldn't send the text. Please try again in a minute.";
  }
}

function checkError(code: number | null): string {
  switch (code) {
    case 20404: // no pending verification: expired, already used, or never sent
      return "That code has expired or was already used. Please ask for a new one.";
    case 60202: // max check attempts
      return "Too many tries. Please ask for a new code.";
    default:
      return "We couldn't check the code. Please try again.";
  }
}

/** Texts codes for phone sign-in. */
export function twilioVerifyProvider(cfg: TwilioConfig): CodeProvider {
  const destinationFor = (contact: Contact) => {
    if (contact.kind !== "phone") throw new Error("Twilio Verify only texts phone numbers.");
    return cfg.demoTo ?? contact.value;
  };
  return {
    channel: "sms",
    destinationFor,

    async send(tx: Tx, contact: Contact) {
      const to = destinationFor(contact);
      if (!(await allowSend(tx, contact.value, MAX_SENDS_PER_HOUR))) return { ok: false, message: TOO_MANY_SENDS };
      if (!(await allowSend(tx, "*", MAX_DELIVERIES_PER_HOUR_TOTAL))) {
        return { ok: false, message: "The demo has sent a lot of texts this hour. Please try again later, or use the demo list." };
      }
      const res = await verifyApi(cfg, "Verifications", { To: to, Channel: "sms" });
      return res.ok ? { ok: true } : { ok: false, message: sendError(res.code) };
    },

    async verify(_tx: Tx, contact: Contact, code: string) {
      const res = await verifyApi(cfg, "VerificationCheck", { To: destinationFor(contact), Code: code.trim() });
      if (!res.ok) return { ok: false, message: checkError(res.code) };
      if (res.data.status !== "approved") return { ok: false, message: "That code isn't right. Please check the text and try again." };
      // The account is found from the number that was typed, not the phone the text went to.
      return { ok: true };
    },
  };
}
