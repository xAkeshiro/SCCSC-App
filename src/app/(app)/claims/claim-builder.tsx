"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { Button, Field, Notice, cx } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { formatDay } from "@/lib/format";
import { formatCents, formatMiles } from "@/lib/money";
import type { PickableTrip } from "@/lib/requests/pickable";
import type { ClaimFormState } from "./actions";

/**
 * Pick the trips to send and confirm. Used to submit a new claim and to resubmit a returned one.
 * Like the certification line at the bottom of the old spreadsheet, but ticked instead of signed.
 */
export function ClaimBuilder({
  trips,
  action,
  submitLabel,
  preselect,
}: {
  trips: PickableTrip[];
  action: (prev: ClaimFormState, formData: FormData) => Promise<ClaimFormState>;
  submitLabel: string;
  /** Which trips start ticked: all of them, or only those already in the claim. */
  preselect: "all" | "in-claim";
}) {
  const [state, onSubmit, pending] = useFormAction<ClaimFormState>(action, {});
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(trips.filter((t) => preselect === "all" || t.inClaim).map((t) => t.id)),
  );
  const [note, setNote] = useState("");
  const [certified, setCertified] = useState(false);
  const chosen = trips.filter((t) => checked.has(t.id));
  const total = chosen.reduce((n, t) => n + t.amountCents, 0);
  const miles = chosen.reduce((n, t) => n + Number(t.miles), 0);
  const allOn = chosen.length === trips.length;

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groups = [
    { key: "in", title: "Trips in this claim", list: trips.filter((t) => t.inClaim) },
    { key: "out", title: trips.some((t) => t.inClaim) ? "Other trips you haven't submitted" : null, list: trips.filter((t) => !t.inClaim) },
  ].filter((g) => g.list.length > 0);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <fieldset className="space-y-4">
        <legend className="sr-only">Trips to include</legend>
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-500">Untick any trip you want to keep for later.</p>
          <button
            type="button"
            className="min-h-10 font-display text-sm font-medium text-brand-600 hover:underline"
            onClick={() => setChecked(allOn ? new Set() : new Set(trips.map((t) => t.id)))}
          >
            {allOn ? "Untick all" : "Tick all"}
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.key}>
            {g.title ? <h2 className="mb-2 text-lg">{g.title}</h2> : null}
            <ul className="grid gap-2">
              {g.list.map((t) => (
                <li key={t.id}>
                  <label
                    className={cx(
                      "card flex cursor-pointer items-start gap-4 p-4 transition-colors",
                      checked.has(t.id) ? "border-brand-600/40 bg-brand-50/40" : "hover:bg-surface",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="item"
                      value={t.id}
                      checked={checked.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="mt-1 size-5 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-500">{formatDay(t.date)}</span>
                      <span className="block font-display font-medium">{t.route}</span>
                      <span className="block text-ink-700">{t.purpose}</span>
                      {t.flagged ? <span className="mt-1 block text-sm text-status-returned">Flagged for your coordinator</span> : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-display font-semibold">{formatCents(t.amountCents)}</span>
                      <span className="block text-sm text-ink-500">{formatMiles(t.miles)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </fieldset>

      <div className="card space-y-5 p-5 sm:p-6">
        <Field label="Note to your coordinator" htmlFor="note" optional>
          <textarea id="note" name="note" rows={2} className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-btn)] border border-ink-100 bg-surface p-4">
          <input
            type="checkbox"
            name="certify"
            checked={certified}
            onChange={(e) => setCertified(e.target.checked)}
            className="mt-0.5 size-5 shrink-0"
          />
          <span>
            I confirm these trips were for SCCSC business, in my own vehicle, and that the dates, places and miles are
            correct. My normal commute is not included.
          </span>
        </label>
      </div>

      <div className="card sticky bottom-[5.5rem] z-10 flex items-center justify-between gap-4 px-4 py-3 shadow-[var(--shadow-card)] md:bottom-4 sm:px-5">
        <div aria-live="polite">
          <p className="text-sm text-ink-500">
            {chosen.length} of {trips.length} {trips.length === 1 ? "trip" : "trips"} · {formatMiles(miles)}
          </p>
          <p className="font-display text-2xl font-semibold text-brand-600">{formatCents(total)}</p>
        </div>
        <Button type="submit" disabled={pending || chosen.length === 0}>
          <Send aria-hidden className="size-4" />
          {pending ? "Sending…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
