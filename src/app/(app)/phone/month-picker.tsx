"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BillPicker, type ExistingFile, type PickedFile } from "@/components/bill-picker";
import { Button, Field, Notice, cx } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { formatCents } from "@/lib/money";
import { formatMonth } from "@/lib/requests/phone";
import { SiteSelect } from "@/components/site-select";
import type { SiteGroup } from "@/lib/sites";

export type PickerState = { error?: string };

export type PickableMonth = {
  /** What the form sends: the month (new claim) or the item id (resubmitting). */
  value: string;
  month: string;
  amountCents: number | null;
  /** Already claimed, or no rate: shown but can't be ticked. */
  unavailable?: string;
  checked: boolean;
};

/**
 * Tick the months of a phone bill to claim, add a photo or PDF of the bill, then confirm. Used for
 * a new claim (with the school or site) and to resubmit a returned one (untick a month to take it out,
 * or swap the bill).
 */
export function PhoneMonthPicker({
  groups,
  field,
  action,
  submitLabel,
  siteGroups,
  defaultSiteId,
  existingFiles,
}: {
  groups: { title: string | null; months: PickableMonth[] }[];
  field: "month" | "item";
  action: (prev: PickerState, formData: FormData) => Promise<PickerState>;
  submitLabel: string;
  /** New claims only: the school or site it's charged to. */
  siteGroups?: SiteGroup[];
  defaultSiteId?: string | null;
  /** Resubmitting: the bill files already on the claim. */
  existingFiles?: ExistingFile[];
}) {
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  // The chosen files live in state (photos are shrunk first), so they're added when the form is sent.
  const [state, onSubmit, pending] = useFormAction<PickerState>(action, {}, (formData) => {
    for (const p of picked) formData.append("bill", p.file, p.file.name);
    for (const id of removed) formData.append("removeFile", id);
  });
  // Free the photo previews when leaving the page.
  const previews = useRef<PickedFile[]>([]);
  useEffect(() => {
    previews.current = picked;
  }, [picked]);
  useEffect(() => () => previews.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl)), []);
  const all = groups.flatMap((g) => g.months);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(all.filter((m) => m.checked && !m.unavailable).map((m) => m.value)));
  const [siteId, setSiteId] = useState(defaultSiteId ?? "");
  const [note, setNote] = useState("");
  const [certified, setCertified] = useState(false);
  const chosen = all.filter((m) => checked.has(m.value));
  const total = chosen.reduce((n, m) => n + (m.amountCents ?? 0), 0);

  const toggle = (value: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <fieldset className="space-y-4">
        <legend className="sr-only">Months to claim</legend>
        {groups.map((g, i) => (
          <div key={g.title ?? i}>
            {g.title ? <h3 className="mb-2 text-lg">{g.title}</h3> : null}
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.months.map((m) => (
                <li key={m.value}>
                  <label
                    className={cx(
                      "card flex items-center gap-4 p-4 transition-colors",
                      m.unavailable ? "cursor-not-allowed bg-ink-50 text-ink-500" : "cursor-pointer",
                      checked.has(m.value) ? "border-brand-600/40 bg-brand-50/40" : !m.unavailable && "hover:bg-surface",
                    )}
                  >
                    <input
                      type="checkbox"
                      name={field}
                      value={m.value}
                      checked={checked.has(m.value)}
                      disabled={Boolean(m.unavailable)}
                      onChange={() => toggle(m.value)}
                      className="size-5 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display font-medium">{formatMonth(m.month)}</span>
                      {m.unavailable ? <span className="block text-sm">{m.unavailable}</span> : null}
                    </span>
                    {m.amountCents !== null ? <span className="shrink-0 font-display font-semibold">{formatCents(m.amountCents)}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </fieldset>

      <div className="card space-y-5 p-5 sm:p-6">
        <BillPicker picked={picked} onPickedChange={setPicked} existing={existingFiles} removed={removed} onRemovedChange={setRemoved} />
        {siteGroups ? (
          <Field label="School or site" htmlFor="siteId" hint="Where you work. Your usual one is filled in.">
            <SiteSelect id="siteId" name="siteId" groups={siteGroups} value={siteId} onChange={(e) => setSiteId(e.target.value)} />
          </Field>
        ) : null}
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
          <span>I confirm I used my own phone for SCCSC work during these months.</span>
        </label>
      </div>

      <div className="card sticky bottom-[5.5rem] z-10 flex items-center justify-between gap-4 px-4 py-3 shadow-[var(--shadow-card)] lg:bottom-4 sm:px-5">
        <div aria-live="polite">
          <p className="text-sm text-ink-500">
            {chosen.length} {chosen.length === 1 ? "month" : "months"}
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
