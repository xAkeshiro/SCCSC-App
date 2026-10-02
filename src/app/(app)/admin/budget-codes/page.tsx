import { Eye, EyeOff } from "lucide-react";
import type { Metadata } from "next";
import { Button, Card, Container, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { budgetCodesOverview } from "@/lib/data/budget-codes";
import { AdminTabs } from "../admin-tabs";
import { toggleFund, toggleSite } from "./actions";
import { ImportForm, MappingForm } from "./forms";

export const metadata: Metadata = { title: "Budget codes" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function BudgetCodesPage() {
  const viewer = await requireRole("admin");
  const data = await budgetCodesOverview(viewer);
  // An example budget code from a school district (fund 200 if there is one), like 5702-200-211.
  const withSites = data.groups.filter((g) => g.fund && g.sites.length > 0);
  const example = withSites.find((g) => g.fund?.code === "200") ?? withSites.find((g) => g.fund?.code !== "1") ?? withSites[0];

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Admin"
        title="Budget codes"
        description="Every reimbursement line is charged to a budget code like 5430-200-211: the account (what it is), the fund (the Center or a school district) and the school or site. These lists come from Aplos."
      />
      <AdminTabs />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="accounts">
            <h2 id="accounts" className="text-2xl">
              Where each reimbursement goes
            </h2>
            <p className="mt-1 mb-4 text-ink-500">
              The account for each kind of line. Staff choose direct or indirect on each trip, and the school or site; the fund comes with the
              school.
            </p>
            <Card className="p-5 sm:p-6">
              <MappingForm
                mapping={data.mapping}
                accounts={data.accounts.map((a) => ({ number: a.number, name: a.name, parentNumber: a.parentNumber }))}
                exampleFund={example?.fund?.code ?? "200"}
                exampleSite={example?.sites[0]?.code ?? "211"}
              />
            </Card>
          </section>

          <section aria-labelledby="sites">
            <h2 id="sites" className="text-2xl">
              Schools and sites
            </h2>
            <p className="mt-1 mb-4 text-ink-500">
              {plural(data.siteCount, "school or site", "schools and sites")} from Aplos, by fund.{" "}
              {data.hiddenCount ? `${data.hiddenCount} hidden from staff. ` : ""}Hide any that staff shouldn&apos;t charge reimbursements to,
              like bank interest or legal. Hidden ones stay on older claims.
            </p>
            <div className="space-y-3">
              {data.groups.map((g) => {
                const hidden = g.sites.filter((s) => !s.active).length;
                const label = g.fund ? `${g.fund.code} · ${g.fund.name}` : "No fund";
                return (
                  // Opening a section before the page finishes loading isn't a mismatch worth a warning.
                  <details key={g.fund?.code ?? "none"} className="card group" suppressHydrationWarning>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 [&::-webkit-details-marker]:hidden">
                      <span className="font-display text-lg font-semibold">{label}</span>
                      <span className="text-sm text-ink-500">
                        {plural(g.sites.length, "school or site", "schools and sites")}
                        {hidden ? `, ${hidden} hidden` : ""}
                      </span>
                    </summary>
                    <div className="border-t border-ink-100">
                      {g.fund && g.sites.length > 0 ? (
                        <div className="flex flex-wrap gap-2 px-5 pt-3">
                          <form action={toggleFund.bind(null, g.fund.code, true)}>
                            <Button type="submit" variant="ghost" size="sm" disabled={hidden === 0}>
                              <Eye aria-hidden className="size-4" /> Show all to staff
                            </Button>
                          </form>
                          <form action={toggleFund.bind(null, g.fund.code, false)}>
                            <Button type="submit" variant="ghost" size="sm" disabled={hidden === g.sites.length}>
                              <EyeOff aria-hidden className="size-4" /> Hide all
                            </Button>
                          </form>
                        </div>
                      ) : null}
                      <ul className="divide-y divide-ink-100">
                        {g.sites.map((s) => (
                          <li key={s.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 ${s.active ? "" : "bg-ink-50 text-ink-500"}`}>
                            <span className="w-14 shrink-0 font-display font-semibold tabular-nums">{s.code}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block break-words">{s.name}</span>
                              {s.items || s.people ? (
                                <span className="block text-sm text-ink-500">
                                  {[s.items ? `on ${plural(s.items, "trip or bill", "trips or bills")}` : null, s.people ? `usual for ${plural(s.people, "person", "people")}` : null]
                                    .filter(Boolean)
                                    .join(", ")}
                                </span>
                              ) : null}
                            </span>
                            <form action={toggleSite.bind(null, s.id, !s.active)}>
                              <Button type="submit" variant={s.active ? "ghost" : "secondary"} size="sm">
                                {s.active ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                                {s.active ? "Hide" : "Show"}
                                <span className="sr-only"> {s.name}</span>
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="text-lg">Update from Aplos</h2>
            <p className="text-ink-700">
              Use the <span className="font-semibold">register import template</span> from Aplos (the Excel file with Accounts, Funds and Tags -
              Schools tabs). New accounts, funds and schools are added and names are updated. Nothing is deleted.
            </p>
            <ImportForm />
            <p className="text-sm text-ink-500">
              Do this again whenever accounts or school tags change in Aplos. Schools you&apos;ve hidden stay hidden.
            </p>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg">In the app now</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
              {[
                { n: data.accounts.length, label: "Accounts" },
                { n: data.funds.length, label: "Funds" },
                { n: data.siteCount, label: "Schools and sites" },
              ].map((x) => (
                <div key={x.label}>
                  <dt className="text-sm text-ink-500">{x.label}</dt>
                  <dd className="font-display text-2xl font-semibold text-brand-600">{x.n}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </aside>
      </div>
    </Container>
  );
}
