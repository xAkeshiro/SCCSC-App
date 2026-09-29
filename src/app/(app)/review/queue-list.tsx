"use client";

import { ChevronRight, Home, PencilLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Chip, Notice, cx } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { formatDay, plural, timeAgo } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { claimNumber } from "@/lib/requests/status";
import { bulkApprove, type BulkState } from "./actions";

export type QueueItem = {
  id: string;
  ref: number;
  ownerName: string;
  totalCents: number;
  submittedAt: string;
  tripCount: number;
  firstDate: string | null;
  lastDate: string | null;
  homeTrips: number;
  changedMiles: number;
  note: string | null;
  simple: boolean;
};

/** Claims waiting for review. Simple ones can be ticked and approved together. */
export function QueueList({ items, bulkLimitText }: { items: QueueItem[]; bulkLimitText: string }) {
  const [state, onSubmit, pending] = useFormAction<BulkState>(bulkApprove, {});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const simple = items.filter((i) => i.simple);
  const total = items.filter((i) => picked.has(i.id)).reduce((n, i) => n + i.totalCents, 0);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {simple.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-500">
          <p>Claims under {bulkLimitText} with nothing flagged can be approved together.</p>
          <button
            type="button"
            className="min-h-10 font-display font-medium text-brand-600 hover:underline"
            onClick={() => setPicked(picked.size === simple.length ? new Set() : new Set(simple.map((s) => s.id)))}
          >
            {picked.size === simple.length ? "Untick all" : `Tick all ${simple.length} simple claims`}
          </button>
        </div>
      ) : null}
      <ul className="grid gap-3">
        {items.map((c) => (
          <li key={c.id} className={cx("card flex items-stretch", picked.has(c.id) && "border-brand-600/40 bg-brand-50/40")}>
            {c.simple ? (
              <label className="flex cursor-pointer items-start py-5 pl-5">
                <input
                  type="checkbox"
                  name="claim"
                  value={c.id}
                  checked={picked.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="mt-1 size-5"
                  aria-label={`Select ${c.ownerName}'s claim ${claimNumber(c.ref)} to approve`}
                />
              </label>
            ) : (
              <span className="w-5 shrink-0" aria-hidden />
            )}
            <Link href={`/claims/${c.id}`} className="flex min-w-0 flex-1 items-center gap-4 p-5 hover:bg-surface/60">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-lg font-semibold">{c.ownerName}</span>
                  <span className="text-ink-500">Claim {claimNumber(c.ref)}</span>
                </p>
                <p className="mt-0.5 text-ink-500">
                  {plural(c.tripCount, "trip")}
                  {c.firstDate && c.lastDate
                    ? ` · ${formatDay(c.firstDate, { weekday: false })}${c.firstDate !== c.lastDate ? ` to ${formatDay(c.lastDate, { weekday: false })}` : ""}`
                    : ""}{" "}
                  · sent {timeAgo(c.submittedAt)}
                </p>
                {c.note ? <p className="mt-1 text-ink-700">“{c.note}”</p> : null}
                {c.homeTrips || c.changedMiles ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.homeTrips ? (
                      <Chip className="bg-status-returned-bg text-status-returned">
                        <Home aria-hidden className="size-3.5" /> {plural(c.homeTrips, "home trip")}
                      </Chip>
                    ) : null}
                    {c.changedMiles ? (
                      <Chip className="bg-status-submitted-bg text-status-submitted">
                        <PencilLine aria-hidden className="size-3.5" /> {c.changedMiles} changed {c.changedMiles === 1 ? "estimate" : "estimates"}
                      </Chip>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <p className="font-display text-xl font-semibold">{formatCents(c.totalCents)}</p>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-500" />
            </Link>
          </li>
        ))}
      </ul>
      {picked.size > 0 ? (
        <div className="card sticky bottom-[5.5rem] z-10 flex items-center justify-between gap-4 px-4 py-3 shadow-[var(--shadow-card)] md:bottom-4 sm:px-5">
          <p aria-live="polite">
            <span className="font-semibold">{plural(picked.size, "claim")}</span> selected ·{" "}
            <span className="font-display font-semibold text-brand-600">{formatCents(total)}</span>
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "Approving…" : `Approve ${picked.size}`}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
