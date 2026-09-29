/** Only same-site relative paths, so a form can't be used to redirect people elsewhere. */
export function safePath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}
