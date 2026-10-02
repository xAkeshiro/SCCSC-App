import type { ReportFilters } from "@/lib/data/finance";
import { todayIso } from "@/lib/format";
import type { RequestStatus } from "@/lib/requests/status";

const DEFAULT_STATUSES: RequestStatus[] = ["approved", "batched", "paid"];

/** Report filters from the URL. Defaults: this year so far, every type, approved/being paid/paid. */
export function parseReportFilters(params: Record<string, string | string[] | undefined>): ReportFilters {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const today = todayIso();
  const statusParam = params.status;
  const statuses = (Array.isArray(statusParam) ? statusParam : statusParam ? [statusParam] : []) as RequestStatus[];
  return {
    from: date(one("from")) || `${today.slice(0, 4)}-01-01`,
    to: date(one("to")) || today,
    staffId: one("staff") || null,
    siteId: one("site") || null,
    statuses: statuses.length ? statuses : DEFAULT_STATUSES,
    type: one("type") === "mileage" || one("type") === "phone" ? (one("type") as "mileage" | "phone") : "all",
  };
}

export function reportQuery(f: ReportFilters) {
  const q = new URLSearchParams({ from: f.from, to: f.to });
  if (f.staffId) q.set("staff", f.staffId);
  if (f.siteId) q.set("site", f.siteId);
  if (f.type !== "all") q.set("type", f.type);
  for (const s of f.statuses) q.append("status", s);
  return q.toString();
}
