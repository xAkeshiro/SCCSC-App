import { userMessage } from "@/db/with-user";

/** An error whose message is written for the person using the app. */
export class UserError extends Error {}

/** The message to show for any error thrown while handling a form. Never leaks SQL or internals. */
export function errorMessage(err: unknown, fallback?: string): string {
  if (err instanceof UserError) return err.message;
  return userMessage(err, fallback);
}
