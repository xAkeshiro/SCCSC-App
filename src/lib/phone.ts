/** US phone numbers. Staff sign in with their mobile number, stored as E.164 (+19165550101). */

export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && /^[2-9]/.test(digits.slice(1))) return `+${digits}`;
  return null;
}

/** +19165550101 -> (916) 555-0101 */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Shows only the last four digits: (•••) •••-0101 */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return `(•••) •••-${d.slice(-4)}`;
}
