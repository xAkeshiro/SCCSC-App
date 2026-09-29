/**
 * Compares the name someone types at sign-in with the name on the staff roster.
 * Ignores case, accents, spaces and punctuation, so "Mary-Jane O'Neil" matches "maryjane oneil".
 * Anything else (a nickname, a different spelling) is not a match and goes to an admin to check.
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function namesMatch(a: string, b: string): boolean {
  const ka = nameKey(a);
  return ka.length > 0 && ka === nameKey(b);
}

/** Tidies whitespace in a typed name, for storing and display. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function firstName(fullName: string): string {
  return cleanName(fullName).split(" ")[0] ?? fullName;
}
