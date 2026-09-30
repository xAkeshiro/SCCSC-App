/**
 * Sign-in codes sent by text message.
 *
 * Two providers, picked by getCodeProvider() (./code-provider.ts):
 * - Twilio Verify (./twilio.ts), when TWILIO_* is set: a real text message. For the demo,
 *   DEMO_SMS_TO sends every code to one phone (Eden's), whatever number was typed.
 * - On-screen (below), otherwise: stores a hashed code in demo.verification_codes and hands it
 *   back so the sign-in page can show it ("demo text message").
 * When the app moves to Supabase, its phone sign-in (which can use Twilio Verify) takes over;
 * the rest of the sign-in flow stays the same.
 */
import { createHash, randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { rows } from "@/db/with-user";

export type SendResult = { ok: true; demoCode?: string } | { ok: false; message: string };
export type VerifyResult = { ok: true; userId: string } | { ok: false; message: string };

export type CodeProvider = {
  /** Shows the code on screen instead of texting it. */
  showsCodeOnScreen: boolean;
  /** The phone the code is actually sent to for someone who typed `phoneE164`. */
  destinationFor(phoneE164: string): string;
  send(tx: Tx, phoneE164: string): Promise<SendResult>;
  /** On success, returns the sign-in account (auth user) for that phone, creating it if needed. */
  verify(tx: Tx, phoneE164: string, code: string): Promise<VerifyResult>;
};

export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_HOUR = 5;
/** Real texts cost money and all go to one phone in the demo: cap them across everyone. */
export const MAX_TEXTS_PER_HOUR_TOTAL = 20;

function hashCode(phone: string, code: string) {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

/** Supabase stores auth phone numbers without the leading "+". */
export function authPhone(phoneE164: string) {
  return phoneE164.replace(/^\+/, "");
}

/** The sign-in account (auth user) for a verified phone, created on first sign-in. */
export async function upsertAuthUser(tx: Tx, phoneE164: string): Promise<string> {
  const [user] = await rows<{ id: string }>(
    tx,
    sql`insert into auth.users (phone, last_sign_in_at) values (${authPhone(phoneE164)}, now())
        on conflict (phone) do update set last_sign_in_at = now()
        returning id`,
  );
  return user.id;
}

/**
 * Counts a send against an hourly limit for `key` (a phone number, or "*" for everyone).
 * Returns false, without counting, when the limit is already reached. Demo database only.
 */
export async function allowSend(tx: Tx, key: string, maxPerHour: number): Promise<boolean> {
  const id = `limit:${key}`;
  const [row] = await rows<{ window_started_at: string; sent_in_window: number }>(
    tx,
    sql`select window_started_at, sent_in_window from demo.verification_codes where phone = ${id} for update`,
  );
  if (!row) {
    await tx.execute(sql`insert into demo.verification_codes (phone, code_hash, expires_at) values (${id}, '', now())`);
    return true;
  }
  const windowOpen = Date.now() - new Date(row.window_started_at).getTime() < 60 * 60 * 1000;
  if (windowOpen && row.sent_in_window >= maxPerHour) return false;
  await tx.execute(sql`
    update demo.verification_codes
       set window_started_at = case when ${windowOpen} then window_started_at else now() end,
           sent_in_window = case when ${windowOpen} then sent_in_window + 1 else 1 end
     where phone = ${id}`);
  return true;
}

export const demoCodeProvider: CodeProvider = {
  showsCodeOnScreen: true,
  destinationFor: (phone) => phone,

  async send(tx, phone) {
    const [existing] = await rows<{ window_started_at: string; sent_in_window: number }>(
      tx,
      sql`select window_started_at, sent_in_window from demo.verification_codes where phone = ${phone}`,
    );
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expires = sql`now() + make_interval(mins => ${CODE_TTL_MINUTES})`;
    if (!existing) {
      await tx.execute(
        sql`insert into demo.verification_codes (phone, code_hash, expires_at) values (${phone}, ${hashCode(phone, code)}, ${expires})`,
      );
      return { ok: true, demoCode: code };
    }
    const windowOpen = Date.now() - new Date(existing.window_started_at).getTime() < 60 * 60 * 1000;
    if (windowOpen && existing.sent_in_window >= MAX_SENDS_PER_HOUR) {
      return { ok: false, message: "Too many codes were sent to this number. Please wait an hour and try again." };
    }
    await tx.execute(sql`
      update demo.verification_codes
         set code_hash = ${hashCode(phone, code)}, expires_at = ${expires}, attempts = 0,
             window_started_at = case when ${windowOpen} then window_started_at else now() end,
             sent_in_window = case when ${windowOpen} then sent_in_window + 1 else 1 end
       where phone = ${phone}`);
    return { ok: true, demoCode: code };
  },

  async verify(tx, phone, code) {
    const [row] = await rows<{ code_hash: string; expired: boolean; attempts: number }>(
      tx,
      sql`select code_hash, expires_at < now() as expired, attempts from demo.verification_codes where phone = ${phone} for update`,
    );
    if (!row) return { ok: false, message: "Please ask for a new code." };
    if (row.expired) return { ok: false, message: "That code has expired. Please ask for a new one." };
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false, message: "Too many tries. Please ask for a new code." };
    if (row.code_hash !== hashCode(phone, code.trim())) {
      await tx.execute(sql`update demo.verification_codes set attempts = attempts + 1 where phone = ${phone}`);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      return {
        ok: false,
        message: left > 0 ? `That code isn't right. You have ${left} more ${left === 1 ? "try" : "tries"}.` : "Too many tries. Please ask for a new code.",
      };
    }
    // One use only.
    await tx.execute(sql`delete from demo.verification_codes where phone = ${phone}`);
    return { ok: true, userId: await upsertAuthUser(tx, phone) };
  },
};
