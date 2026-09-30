/**
 * How someone signs in: their email (the default) or their mobile number. Codes, sign-in accounts
 * and roster matching are all keyed by the normalized value.
 */
import { formatPhone, maskPhone } from "./phone";

export type ContactKind = "email" | "phone";
/** `value` is a lowercase email address, or a phone number in E.164 (+19165550101). */
export type Contact = { kind: ContactKind; value: string };

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/;

/** " Rowan.Ellery@Example.org " -> "rowan.ellery@example.org", or null if it isn't an email address. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** rowan.ellery@example.org -> ro•••@example.org */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}

export function formatContact(contact: Contact): string {
  return contact.kind === "email" ? contact.value : formatPhone(contact.value);
}

export function maskContact(contact: Contact): string {
  return contact.kind === "email" ? maskEmail(contact.value) : maskPhone(contact.value);
}
