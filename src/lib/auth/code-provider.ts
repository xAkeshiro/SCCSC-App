import { hasHostedDatabase } from "@/db";
import type { ContactKind } from "@/lib/contact";
import { demoCodeProvider, type CodeProvider } from "./codes";
import { emailCodeProvider, emailConfig } from "./email";
import { twilioConfig, twilioVerifyProvider } from "./twilio";

/**
 * How sign-in codes reach someone signing in with an email (the default) or a phone number.
 * - Email: the demo inbox when Resend is set up, otherwise on screen.
 * - Phone: a text when Twilio is set up, otherwise the demo inbox when Resend is set up, otherwise
 *   on screen. (Texts cost money, so the demo doesn't need them.)
 * Throws when nothing suitable is set up.
 */
export function getCodeProvider(kind: ContactKind): CodeProvider {
  if (kind === "phone") {
    const twilio = twilioConfig();
    if (twilio) {
      // Sending every code to one phone lets that phone sign in as anyone: fine for fake data only.
      if (twilio.demoTo && hasHostedDatabase()) {
        throw new Error("DEMO_SMS_TO sends every sign-in code to one phone. Remove it before using a real database.");
      }
      return twilioVerifyProvider(twilio);
    }
  }
  const email = emailConfig();
  if (email) {
    // Every code goes to one inbox, so that inbox can sign in as anyone: fine for fake data only.
    if (hasHostedDatabase()) {
      throw new Error("DEMO_EMAIL_TO sends every sign-in code to one inbox. Remove it before using a real database.");
    }
    return emailCodeProvider(email);
  }
  // The on-screen provider would let anyone sign in as anyone.
  // It must never run against real data: Supabase Auth takes over sign-in codes then (M7).
  if (hasHostedDatabase()) {
    throw new Error("No sign-in code provider is set up. The demo sign-in code provider can't be used with a real database.");
  }
  return demoCodeProvider;
}

/** Whether "Use your phone number instead" is offered. */
export function phoneSignInAvailable(): boolean {
  try {
    getCodeProvider("phone");
    return true;
  } catch {
    return false;
  }
}
