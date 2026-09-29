/** Dates for people: "Mon, Sep 29" / "Sep 29, 2026" / "2 days ago". Pacific time. */
const TZ = "America/Los_Angeles";

/** A calendar date stored as YYYY-MM-DD (no time zone). */
export function formatDay(isoDate: string, { withYear = false, weekday = true } = {}) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  });
}

export function formatDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
}

export function timeAgo(value: Date | string, now = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(date);
}

/** Today's date in Sacramento, as YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
