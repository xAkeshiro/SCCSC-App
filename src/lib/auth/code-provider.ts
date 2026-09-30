import { hasHostedDatabase } from "@/db";
import { demoCodeProvider, type CodeProvider } from "./codes";
import { emailCodeProvider, emailConfig } from "./email";
import { twilioConfig, twilioVerifyProvider } from "./twilio";

/**
 * Where sign-in codes go: the demo inbox when Resend is set up, real texts when Twilio is set up,
 * otherwise on screen (demo data only).
 */
export function getCodeProvider(): CodeProvider {
  const email = emailConfig();
  if (email) {
    // Every code goes to one inbox, so that inbox can sign in as anyone: fine for fake data only.
    if (hasHostedDatabase()) {
      throw new Error("DEMO_EMAIL_TO sends every sign-in code to one inbox. Remove it before using a real database.");
    }
    return emailCodeProvider(email);
  }
  const twilio = twilioConfig();
  if (twilio) {
    // Sending every code to one phone lets that phone sign in as anyone: fine for fake data only.
    if (twilio.demoTo && hasHostedDatabase()) {
      throw new Error("DEMO_SMS_TO sends every sign-in code to one phone. Remove it before using a real database.");
    }
    return twilioVerifyProvider(twilio);
  }
  // The on-screen provider would let anyone sign in as anyone.
  // It must never run against real data: a real SMS provider comes with Supabase (M7).
  if (hasHostedDatabase()) {
    throw new Error("No text message provider is set up. The demo sign-in code provider can't be used with a real database.");
  }
  return demoCodeProvider;
}
