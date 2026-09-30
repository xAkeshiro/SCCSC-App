"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Field, Notice, cx } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { formatDay, plural } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { batchNumber, claimNumber } from "@/lib/requests/status";
import { REQUEST_TYPES, itemsSummary, type RequestType } from "@/lib/requests/types";
import { batchClaims, type FinanceState } from "./actions";

export type BuilderClaim = {
  id: string;
  ref: number;
  type: RequestType;
  ownerName: string;
  totalCents: number;
  tripCount: number;
  firstDate: string | null;
  lastDate: string | null;
  approvedBy: string | null;
};

/** Tick approved claims, set the pay period, and put them in a batch. */
export function BatchBuilder({
  claims,
  openBatches,
  defaultStart,
  defaultEnd,
}: {
  claims: BuilderClaim[];
  openBatches: { id: string; ref: number; periodStart: string; periodEnd: string }[];
  defaultStart: string;
  defaultEnd: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FinanceState>(batchClaims, {});
  const [picked, setPicked] = useState<Set<string>>(() => new Set(claims.map((c) => c.id)));
  const [target, setTarget] = useState("new");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [note, setNote] = useState("");
  const chosen = claims.filter((c) => picked.has(c.id));
  const total = chosen.reduce((n, c) => n + c.totalCents, 0);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <ul className="card divide-y divide-ink-100">
        {claims.map((c) => (
          <li key={c.id} className={cx("flex items-center gap-4 px-5 py-3", picked.has(c.id) && "bg-brand-50/40")}>
            <input
              type="checkbox"
              name="claim"
              value={c.id}
              checked={picked.has(c.id)}
              onChange={() => toggle(c.id)}
              className="size-5 shrink-0"
              aria-label={`Include ${c.ownerName}'s claim ${claimNumber(c.ref, c.type)}`}
            />
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-semibold">{c.ownerName}</span>{" "}
                <Link href={`/claims/${c.id}`} className="text-brand-600 hover:underline">
                  {claimNumber(c.ref, c.type)}
                </Link>{" "}
                <span className="text-sm text-ink-500">{REQUEST_TYPES[c.type].label}</span>
              </p>
              <p className="text-sm text-ink-500">
                {itemsSummary(c.type, c.tripCount, c.firstDate, c.lastDate)}
                {c.approvedBy ? ` · approved by ${c.approvedBy}` : ""}
              </p>
            </div>
            <p className="font-display font-semibold">{formatCents(c.totalCents)}</p>
          </li>
        ))}
      </ul>

      <div className="card grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        {openBatches.length > 0 ? (
          <Field label="Put them in" htmlFor="target" className="sm:col-span-2">
            <select id="target" name="target" className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">A new batch</option>
              {openBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  Batch {batchNumber(b.ref)} (open, {formatDay(b.periodStart, { weekday: false })} to {formatDay(b.periodEnd, { weekday: false })})
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {target === "new" ? (
          <>
            <Field label="Pay period starts" htmlFor="period_start">
              <input id="period_start" name="period_start" type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Pay period ends" htmlFor="period_end">
              <input id="period_end" name="period_end" type="date" className="field" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field label="Note" htmlFor="batch_note" optional className="sm:col-span-2">
              <input id="batch_note" name="note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        ) : null}
      </div>

      <div className="card sticky bottom-[5.5rem] z-10 flex items-center justify-between gap-4 px-4 py-3 shadow-[var(--shadow-card)] lg:bottom-4 sm:px-5">
        <div aria-live="polite">
          <p className="text-sm text-ink-500">
            {chosen.length} of {plural(claims.length, "claim")}
          </p>
          <p className="font-display text-2xl font-semibold text-brand-600">{formatCents(total)}</p>
        </div>
        <Button type="submit" disabled={pending || chosen.length === 0}>
          <Layers aria-hidden className="size-4" />
          {pending ? "Saving…" : target === "new" ? "Create batch" : "Add to batch"}
        </Button>
      </div>
    </form>
  );
}
