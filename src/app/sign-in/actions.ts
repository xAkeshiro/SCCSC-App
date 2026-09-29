"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoData } from "@/db";
import { staff } from "@/db/schema";
import { withSystem } from "@/db/with-user";
import { getCodeProvider } from "@/lib/auth/codes";
import {
  clearPendingSignIn,
  clearSession,
  getPendingSignIn,
  setPendingSignIn,
  setSession,
} from "@/lib/auth/session";
import { completeSignIn } from "@/lib/auth/sign-in";
import { cleanName } from "@/lib/names";
import { normalizeUsPhone } from "@/lib/phone";
import { readSettings } from "@/lib/settings";

export type RequestCodeState = {
  errors?: { name?: string; phone?: string };
  message?: string;
  values?: { name: string; phone: string };
};

export type VerifyCodeState = { error?: string; resent?: boolean };

const DEMO_CODE_COOKIE = "sccsc_demo_code";

const str = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Step 1: name + phone -> send a code. */
export async function requestCode(_prev: RequestCodeState, formData: FormData): Promise<RequestCodeState> {
  const name = cleanName(str(formData.get("name"), 120));
  const phoneInput = str(formData.get("phone"), 40);
  const phone = normalizeUsPhone(phoneInput);
  const errors: RequestCodeState["errors"] = {};
  if (name.length < 2 || !name.includes(" ")) errors.name = "Enter your first and last name, as payroll has it.";
  if (!phone) errors.phone = "Enter a 10-digit US mobile number, like (916) 555-0123.";
  if (errors.name || errors.phone) return { errors, values: { name, phone: phoneInput } };

  const provider = getCodeProvider();
  const result = await withSystem((tx) => provider.send(tx, phone!));
  if (!result.ok) return { message: result.message, values: { name, phone: phoneInput } };

  await setPendingSignIn({ name, phone: phone! });
  // Demo only: the page shows the code, since no text message is sent.
  if (result.demoCode) await setDemoCode(result.demoCode);
  redirect("/sign-in");
}

/** Step 2: check the code, then sign in or file an access request. */
export async function verifyCode(_prev: VerifyCodeState, formData: FormData): Promise<VerifyCodeState> {
  const pending = await getPendingSignIn();
  if (!pending) redirect("/sign-in");
  const code = str(formData.get("code"), 12).replace(/\D/g, "");
  if (code.length !== 6) return { error: "Enter the 6-digit code from the text message." };

  const provider = getCodeProvider();
  const outcome = await withSystem(async (tx) => {
    const verified = await provider.verify(tx, pending.phone, code);
    if (!verified.ok) return { error: verified.message } as const;
    const result = await completeSignIn(tx, { userId: verified.userId, fullName: pending.name, phoneE164: pending.phone });
    const { sessionDays } = await readSettings(tx);
    return { userId: verified.userId, result, sessionDays } as const;
  });
  if ("error" in outcome) return { error: outcome.error };

  await clearPendingSignIn();
  await clearDemoCode();
  await setSession(outcome.userId, outcome.result.kind === "signed-in" ? outcome.sessionDays : 7);
  redirect(outcome.result.kind === "signed-in" ? "/" : "/pending");
}

export async function resendCode(): Promise<VerifyCodeState> {
  const pending = await getPendingSignIn();
  if (!pending) redirect("/sign-in");
  const provider = getCodeProvider();
  const result = await withSystem((tx) => provider.send(tx, pending.phone));
  if (!result.ok) return { error: result.message };
  await setPendingSignIn(pending);
  if (result.demoCode) await setDemoCode(result.demoCode);
  return { resent: true };
}

export async function startOver() {
  await clearPendingSignIn();
  await clearDemoCode();
  redirect("/sign-in");
}

export async function signOut() {
  await clearSession();
  redirect("/sign-in");
}

/** Demo only: sign in as one of the fake people without a code, to explore each role. */
export async function signInAsDemoPerson(formData: FormData) {
  if (!isDemoData()) redirect("/sign-in");
  const staffId = str(formData.get("staffId"), 64);
  const found = await withSystem(async (tx) => {
    const [person] = await tx.select().from(staff).where(eq(staff.id, staffId)).limit(1);
    const { sessionDays } = await readSettings(tx);
    return person?.userId && person.status === "active" ? { userId: person.userId, sessionDays } : null;
  });
  if (!found) redirect("/sign-in");
  await clearPendingSignIn();
  await setSession(found.userId, found.sessionDays);
  redirect("/");
}

// The "demo text message": kept in a short-lived cookie so the code screen can show it.
async function setDemoCode(code: string) {
  (await cookies()).set(DEMO_CODE_COOKIE, code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
}

async function clearDemoCode() {
  (await cookies()).delete(DEMO_CODE_COOKIE);
}
