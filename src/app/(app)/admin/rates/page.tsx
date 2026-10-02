import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, Chip, Container, Notice, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { ratesAndRules } from "@/lib/data/rates";
import { formatDateTime, formatDay } from "@/lib/format";
import { RATE_TYPES, formatRateDollars, type RateType } from "@/lib/rules";
import { AdminTabs } from "../admin-tabs";
import { deleteRateAction } from "./actions";
import { AddRateForm, RulesForm } from "./forms";

export const metadata: Metadata = { title: "Rates and rules" };

const DONE: Record<string, string> = {
  rate: "Rate saved.",
  deleted: "Rate deleted.",
  rules: "Rules saved. They apply from now on.",
  unchanged: "Nothing had changed.",
};

const day = (d: string) => formatDay(d, { withYear: true, weekday: false });

export default async function RatesPage({ searchParams }: PageProps<"/admin/rates">) {
  const viewer = await requireRole("admin");
  const { done, error } = await searchParams;
  const data = await ratesAndRules(viewer);
  const lastRuleChange = Object.values(data.changed).sort((a, b) => b.at.getTime() - a.at.getTime())[0];

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Admin"
        title="Rates and rules"
        description="What each reimbursement pays, and the rules that are still SCCSC's call. Changes are kept in the admin history."
      />
      <AdminTabs />
      {typeof done === "string" && DONE[done] ? (
        <Notice tone="success" className="mb-6">
          {DONE[done]}
        </Notice>
      ) : null}
      {typeof error === "string" ? (
        <Notice tone="error" className="mb-6">
          {error}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section aria-labelledby="rates-heading" className="space-y-6">
          <h2 id="rates-heading" className="text-2xl">
            Rates
          </h2>
          {(Object.keys(RATE_TYPES) as RateType[]).map((type) => {
            const list = data.rates[type];
            const current = list.find((r) => r.when === "current");
            return (
              <Card key={type} id={type} className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xl">{RATE_TYPES[type].label}</h3>
                  {current ? (
                    <p className="font-display text-2xl font-semibold text-brand-600">{formatRateDollars(current.rateCents, type)}</p>
                  ) : (
                    <p className="font-semibold text-status-returned">No rate yet</p>
                  )}
                </div>
                <ul className="divide-y divide-ink-100 border-y border-ink-100">
                  {list.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{formatRateDollars(r.rateCents, type)}</span>
                          <span className="text-ink-700">from {day(r.effectiveFrom)}</span>
                          {r.when === "current" ? <Chip className="bg-status-approved-bg text-status-approved">In use</Chip> : null}
                          {r.when === "upcoming" ? <Chip className="bg-status-submitted-bg text-status-submitted">Coming up</Chip> : null}
                        </p>
                        {r.note ? <p className="text-sm text-ink-500">{r.note}</p> : null}
                        {r.createdBy ? (
                          <p className="text-xs text-ink-500">
                            Added by {r.createdBy}, {formatDateTime(r.createdAt)}
                          </p>
                        ) : null}
                      </div>
                      {r.when === "upcoming" ? (
                        <form action={deleteRateAction.bind(null, r.id)}>
                          <ConfirmButton variant="ghost" size="sm" confirm={`Delete the rate starting ${day(r.effectiveFrom)}?`}>
                            <Trash2 aria-hidden className="size-4" />
                            <span className="sr-only">Delete the rate starting {day(r.effectiveFrom)}</span>
                          </ConfirmButton>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <AddRateForm type={type} today={data.today} />
              </Card>
            );
          })}
          <p className="text-sm text-ink-500">
            Rates that have started stay, so every claim shows what it was paid at. To change one, add a new rate from the date it changes.
          </p>
        </section>

        <section aria-labelledby="rules" className="space-y-4">
          <div>
            <h2 id="rules" className="text-2xl">
              Rules
            </h2>
            <p className="mt-1 text-ink-500">
              {lastRuleChange ? `Last changed by ${lastRuleChange.by}, ${formatDateTime(lastRuleChange.at)}. ` : ""}
              The Aplos accounts are on{" "}
              <Link href="/admin/budget-codes" className="text-brand-600 hover:underline">
                Budget codes
              </Link>
              .
            </p>
          </div>
          <Card className="p-5 sm:p-6">
            <RulesForm rules={data.rules} />
          </Card>
        </section>
      </div>
    </Container>
  );
}
