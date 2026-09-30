/**
 * Sign-in codes by email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Free for the demo (about 100 emails a day). The app makes and checks the code (`localCodes`);
 * Resend only delivers it.
 *
 * Staff sign in with their phone, not an email address, so this is a demo channel: every code goes
 * to one inbox (Eden's), whatever number was typed. The typed number still decides who signs in.
 *
 * Environment (see .env.example):
 *   RESEND_API_KEY  an API key with "Sending access"
 *   DEMO_EMAIL_TO   the inbox that gets every demo code
 *   EMAIL_FROM      optional. Without a verified domain, Resend only sends from onboarding@resend.dev,
 *                   and only to the address the Resend account signed up with.
 */
import { maskPhone } from "@/lib/phone";
import { localCodes, type CodeProvider, type Deliver } from "./codes";
import { signInCodeEmail } from "./sign-in-email";

export type EmailConfig = { apiKey: string; to: string; from: string };

const DEFAULT_FROM = "SCCSC Staff <onboarding@resend.dev>";
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Resend settings from the environment, or null when email isn't set up. */
export function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.DEMO_EMAIL_TO?.trim();
  if (!apiKey && !to) return null;
  if (!apiKey || !to) throw new Error("Sign-in emails need both RESEND_API_KEY and DEMO_EMAIL_TO.");
  if (!EMAIL_PATTERN.test(to)) throw new Error("DEMO_EMAIL_TO must be one email address, like you@example.com.");
  return { apiKey, to, from: process.env.EMAIL_FROM?.trim() || DEFAULT_FROM };
}

/** you@example.com -> yo•••@example.com */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}

function sendError(status: number): string {
  switch (status) {
    case 401:
    case 403:
      // 403 is also what a Resend account without a verified domain gets for any other address.
      return "Sign-in emails aren't set up correctly. Please ask the app admin to check the Resend settings.";
    case 429:
      return "Too many emails were sent just now. Please wait a minute and try again.";
    default:
      return "We couldn't send the email. Please try again in a minute.";
  }
}

export function emailCodeProvider(cfg: EmailConfig): CodeProvider {
  const deliver: Deliver = async ({ code, phoneE164, fullName }) => {
    const email = signInCodeEmail({ code, fullName, phoneMasked: maskPhone(phoneE164), demo: true });
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject: email.subject, html: email.html, text: email.text }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.error("Resend: request failed", err instanceof Error ? err.message : err);
      return { ok: false, message: sendError(0) };
    }
    if (!res.ok) {
      // Resend's message helps whoever reads the logs; people see a plain-language one instead.
      const data = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
      console.error(`Resend: ${res.status} ${data.name ?? ""} ${data.message ?? ""}`);
      return { ok: false, message: sendError(res.status) };
    }
    return { ok: true };
  };

  return localCodes({ channel: "email", destinationFor: () => cfg.to, deliver });
}
