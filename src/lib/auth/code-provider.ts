import { hasHostedDatabase } from "@/db";
import { demoCodeProvider, type CodeProvider } from "./codes";
import { twilioConfig, twilioVerifyProvider } from "./twilio";

/** Real texts when Twilio is set up; otherwise the code is shown on screen (demo data only). */
export function getCodeProvider(): CodeProvider {
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
