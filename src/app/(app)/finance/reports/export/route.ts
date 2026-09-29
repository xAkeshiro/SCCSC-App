import { notFound } from "next/navigation";
import { getViewer, hasRole } from "@/lib/auth/viewer";
import { csvResponse, dollars, toCsv } from "@/lib/csv";
import { mileageReport } from "@/lib/data/finance";
import { parseReportFilters } from "@/lib/requests/report-filters";
import { STATUS_LABEL, claimNumber } from "@/lib/requests/status";

/** The report's trips as a CSV. Read-only, so a plain GET link. */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || !hasRole(viewer, "finance", "admin")) notFound();
  const url = new URL(request.url);
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    params[key] = all.length > 1 ? all : all[0];
  }
  const filters = parseReportFilters(params);
  const report = await mileageReport(viewer, filters);
  const csv = toCsv(
    ["Trip date", "Employee", "Business purpose", "Route", "Program code", "Claim", "Claim status", "Miles", "Amount"],
    report.trips.map((t) => [
      t.date,
      t.ownerName,
      t.purpose,
      t.route,
      t.programCode ?? "",
      claimNumber(t.claimRef),
      STATUS_LABEL[t.claimStatus],
      t.miles.toFixed(1),
      dollars(t.amountCents),
    ]),
  );
  return csvResponse(`mileage-${filters.from}-to-${filters.to}.csv`, csv);
}
