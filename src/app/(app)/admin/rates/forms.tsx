"use client";

import { Plus, Save } from "lucide-react";
import { useState } from "react";
import { Button, Field, Notice, describedBy } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { MONTHS_PER_CLAIM_OPTIONS } from "@/lib/requests/phone";
import { HOME_TRIP_RULES, RATE_TYPES, type RateType, type Rules } from "@/lib/rules";
import { addRateAction, saveRulesAction, type RateState, type RulesState } from "./actions";

/** "Add a rate": opens a small form under the rate list. */
export function AddRateForm({ type, today }: { type: RateType; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RateState>(addRateAction.bind(null, type), {});
  const info = RATE_TYPES[type];
  const f = state.fields ?? {};
  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" /> Add a {info.label.toLowerCase().replace(/s$/, "")} rate
      </Button>
    );
  }
  const id = (name: string) => `${type}-${name}`;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-[var(--radius-card)] border border-ink-100 p-4">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={info.field} htmlFor={id("rate")} hint={`For example ${info.example}`} error={f.rate}>
          <input id={id("rate")} name="rate" inputMode="decimal" autoComplete="off" className="field" {...describedBy(id("rate"), { hint: true, error: f.rate })} />
        </Field>
        <Field label="Starts on" htmlFor={id("effectiveFrom")} error={f.effectiveFrom}>
          <input id={id("effectiveFrom")} name="effectiveFrom" type="date" className="field" defaultValue={today} {...describedBy(id("effectiveFrom"), { error: f.effectiveFrom })} />
        </Field>
      </div>
      <Field label="Note" htmlFor={id("note")} optional hint="Where it comes from, like “IRS rate for 2027”.">
        <input id={id("note")} name="note" className="field" autoComplete="off" maxLength={300} aria-describedby={`${id("note")}-hint`} />
      </Field>
      <p className="text-sm text-ink-500">
        Trips and bills from the start date on use it. Ones already logged keep the rate they were saved with.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          <Save aria-hidden className="size-4" /> {pending ? "Saving…" : "Save rate"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function RulesForm({ rules }: { rules: Rules }) {
  const [state, onSubmit, pending] = useFormAction<RulesState>(saveRulesAction, {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-semibold">Trips</legend>
        <Field
          label="Trips that start or end at home"
          htmlFor="homeTripRule"
          hint="Commute miles generally aren't reimbursable. Still to be decided with finance."
          error={e.homeTripRule}
        >
          <select id="homeTripRule" name="homeTripRule" className="field" defaultValue={rules.homeTripRule} {...describedBy("homeTripRule", { hint: true, error: e.homeTripRule })}>
            {HOME_TRIP_RULES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Oldest trip that can be logged (days)" htmlFor="maxTripAgeDays" hint="365 is about a year." error={e.maxTripAgeDays}>
          <input
            id="maxTripAgeDays"
            name="maxTripAgeDays"
            inputMode="numeric"
            className="field max-w-40"
            defaultValue={rules.maxTripAgeDays}
            {...describedBy("maxTripAgeDays", { hint: true, error: e.maxTripAgeDays })}
          />
        </Field>
        <label className="flex min-h-12 items-start gap-3 rounded-[var(--radius-btn)] border border-ink-100 p-3 hover:bg-surface">
          <input type="checkbox" name="requireSite" defaultChecked={rules.requireSite} className="mt-1 size-5 shrink-0" />
          <span>
            <span className="block font-semibold">Every trip and phone bill needs a school or site</span>
            <span className="block text-sm text-ink-500">It&apos;s part of the budget code. Turn off only if some reimbursements have no site.</span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-semibold">Reviewing</legend>
        <Field
          label="Bulk approval for claims up to ($)"
          htmlFor="bulkApproveMax"
          hint="Reviewers can approve these together when nothing is flagged. 0 turns it off."
          error={e.bulkApproveMaxCents}
        >
          <input
            id="bulkApproveMax"
            name="bulkApproveMax"
            inputMode="decimal"
            className="field max-w-40"
            defaultValue={(rules.bulkApproveMaxCents / 100).toFixed(2)}
            {...describedBy("bulkApproveMax", { hint: true, error: e.bulkApproveMaxCents })}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-semibold">Phone bills</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Months per claim" htmlFor="phoneMonthsPerClaim" hint="2: claimed in even months (Feb, Apr, …)." error={e.phoneMonthsPerClaim}>
            <select
              id="phoneMonthsPerClaim"
              name="phoneMonthsPerClaim"
              className="field"
              defaultValue={String(rules.phoneMonthsPerClaim)}
              {...describedBy("phoneMonthsPerClaim", { hint: true, error: e.phoneMonthsPerClaim })}
            >
              {MONTHS_PER_CLAIM_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} {m === 1 ? "month" : "months"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Late periods allowed" htmlFor="phonePeriodsBack" hint="1: the period before the latest one can still be claimed." error={e.phonePeriodsBack}>
            <input
              id="phonePeriodsBack"
              name="phonePeriodsBack"
              inputMode="numeric"
              className="field max-w-40"
              defaultValue={rules.phonePeriodsBack}
              {...describedBy("phonePeriodsBack", { hint: true, error: e.phonePeriodsBack })}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-lg font-semibold">Signing in</legend>
        <Field label="Stay signed in for (days)" htmlFor="sessionDays" hint="On their own phone or computer, before they need a new code." error={e.sessionDays}>
          <input
            id="sessionDays"
            name="sessionDays"
            inputMode="numeric"
            className="field max-w-40"
            defaultValue={rules.sessionDays}
            {...describedBy("sessionDays", { hint: true, error: e.sessionDays })}
          />
        </Field>
      </fieldset>

      <Button type="submit" disabled={pending}>
        <Save aria-hidden className="size-4" /> {pending ? "Saving…" : "Save rules"}
      </Button>
    </form>
  );
}
