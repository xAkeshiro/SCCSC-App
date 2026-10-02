import type { Metadata } from "next";
import { StatusBadge } from "@/components/status-badge";
import { Button, Card, Container, PageHeader, Stat } from "@/components/ui";
import { hasRole, requireRole } from "@/lib/auth/viewer";
import { REPORT_STATUSES, reimbursementReport } from "@/lib/data/finance";
import { formatDay, plural } from "@/lib/format";
import { formatCents, formatMiles } from "@/lib/money";
import { formatMonths } from "@/lib/requests/phone";
import { parseReportFilters, reportQuery } from "@/lib/requests/report-filters";
import { STATUS_LABEL, claimNumber } from "@/lib/requests/status";
import { REQUEST_TYPES } from "@/lib/requests/types";
import { ReportDownloadButton } from "./download-button";
import { SiteSelect } from "@/components/site-select";
import { siteLabel } from "@/lib/sites";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/finance/reports">) {
  const viewer = await requireRole("finance", "admin");
  const filters = parseReportFilters(await searchParams);
  const report = await reimbursementReport(viewer, filters);
  // Finance only sees claims once they're approved; admins can also include ones waiting for approval.
  const statusOptions = hasRole(viewer, "admin") ? REPORT_STATUSES : REPORT_STATUSES.filter((s) => s !== "submitted");

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Finance"
        title="Reimbursement report"
        description="Totals by employee, district, and school or site, for any dates. Trips count on the day they were driven, phone bills on the first day of their month."
      />

      <form method="get" className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
        <div>
          <label htmlFor="from" className="field-label">From</label>
          <input id="from" name="from" type="date" defaultValue={filters.from} className="field" />
        </div>
        <div>
          <label htmlFor="to" className="field-label">To</label>
          <input id="to" name="to" type="date" defaultValue={filters.to} className="field" />
        </div>
        <div>
          <label htmlFor="type" className="field-label">Type</label>
          <select id="type" name="type" defaultValue={filters.type} className="field">
            <option value="all">Mileage and phone bills</option>
            <option value="mileage">Mileage only</option>
            <option value="phone">Phone bills only</option>
          </select>
        </div>
        <div>
          <label htmlFor="staff" className="field-label">Employee</label>
          <select id="staff" name="staff" defaultValue={filters.staffId ?? ""} className="field">
            <option value="">Everyone</option>
            {report.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="site" className="field-label">School or site</label>
          <SiteSelect id="site" name="site" groups={report.siteGroups} defaultValue={filters.siteId ?? ""} placeholder="All schools and sites" />
        </div>
        <fieldset className="sm:col-span-2 lg:col-span-2">
          <legend className="field-label">Claims that are</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {statusOptions.map((s) => (
              <label key={s} className="flex min-h-10 items-center gap-2">
                <input type="checkbox" name="status" value={s} defaultChecked={filters.statuses.includes(s)} className="size-5" />
                {STATUS_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-end gap-2">
          <Button type="submit" className="w-full">
            Show
          </Button>
        </div>
      </form>

      <Card className="mt-6 grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
        <Stat value={report.totals.trips} label="Trips" />
        <Stat value={formatMiles(report.totals.miles)} label="Miles" />
        <Stat value={report.totals.months} label="Phone bill months" />
        <Stat value={formatCents(report.totals.cents)} label="Reimbursed" />
      </Card>

      <div className="mt-6 flex justify-end">
        <ReportDownloadButton query={reportQuery(filters)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[
          { title: "By employee", column: "Employee", rows: report.byEmployee },
          { title: "By district", column: "District", rows: report.byDistrict },
          { title: "By school or site", column: "School or site", rows: report.bySite },
        ].map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h2 className="text-2xl">{g.title}</h2>
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-ink-100 text-sm text-ink-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">{g.column}</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Trips</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Miles</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Phone months</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {g.rows.map((r) => (
                    <tr key={r.label}>
                      <td className="px-5 py-3 font-semibold">{r.label}</td>
                      <td className="px-5 py-3 text-right">{r.trips}</td>
                      <td className="px-5 py-3 text-right">{r.miles.toFixed(1)}</td>
                      <td className="px-5 py-3 text-right">{r.months}</td>
                      <td className="px-5 py-3 text-right">{formatCents(r.cents)}</td>
                    </tr>
                  ))}
                  {g.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center text-ink-500">
                        Nothing matches.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {report.lines.length > 0 ? (
        <section aria-labelledby="detail" className="mt-8">
          <h2 id="detail" className="text-2xl">
            Details <span className="text-ink-500">({plural(report.lines.length, "line")})</span>
          </h2>
          <div className="card mt-3 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-[0.95rem]">
              <thead className="border-b border-ink-100 text-sm text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Employee</th>
                  <th scope="col" className="px-4 py-3 font-semibold">What</th>
                  <th scope="col" className="px-4 py-3 font-semibold">School or site</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Claim</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Miles</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {report.lines.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {t.type === "phone" ? formatMonths([t.date]) : formatDay(t.date, { weekday: false })}
                    </td>
                    <td className="px-4 py-2.5">{t.ownerName}</td>
                    <td className="px-4 py-2.5">
                      {t.type === "phone" ? REQUEST_TYPES.phone.label : t.purpose}
                      {t.type === "mileage" ? <span className="block text-sm text-ink-500">{t.detail}</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.siteCode ? siteLabel({ code: t.siteCode, name: t.siteName ?? "" }) : "—"}
                      {t.fundName ? <span className="block text-sm text-ink-500">{t.fundName}</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {claimNumber(t.claimRef, t.type)}
                      <StatusBadge status={t.claimStatus} className="mt-1 block w-fit" />
                    </td>
                    <td className="px-4 py-2.5 text-right">{t.miles === null ? "—" : t.miles.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCents(t.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </Container>
  );
}
