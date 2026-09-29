import { Banknote, CheckCircle2, CircleDollarSign, Layers, RotateCcw, Send, Undo2, XCircle } from "lucide-react";
import type { ClaimEvent } from "@/lib/data/claims";
import { formatDateTime } from "@/lib/format";
import { ACTION_LABEL } from "@/lib/requests/status";
import { cx } from "./ui";

const ICON = {
  submitted: { Icon: Send, tone: "bg-status-submitted-bg text-status-submitted" },
  resubmitted: { Icon: Send, tone: "bg-status-submitted-bg text-status-submitted" },
  withdrawn: { Icon: Undo2, tone: "bg-status-draft-bg text-status-draft" },
  approved: { Icon: CheckCircle2, tone: "bg-status-approved-bg text-status-approved" },
  returned: { Icon: RotateCcw, tone: "bg-status-returned-bg text-status-returned" },
  denied: { Icon: XCircle, tone: "bg-status-denied-bg text-status-denied" },
  batched: { Icon: Layers, tone: "bg-status-batched-bg text-status-batched" },
  unbatched: { Icon: Banknote, tone: "bg-status-draft-bg text-status-draft" },
  paid: { Icon: CircleDollarSign, tone: "bg-status-approved-bg text-status-approved" },
} as const;

/** The claim's history: every status change with who, when and why. Oldest first. */
export function Timeline({ events }: { events: ClaimEvent[] }) {
  if (events.length === 0) return <p className="text-ink-500">Nothing has happened yet.</p>;
  return (
    <ol className="relative space-y-5">
      {events.map((e, i) => {
        const { Icon, tone } = ICON[e.action];
        return (
          <li key={e.id} className="relative flex gap-3">
            {i < events.length - 1 ? <span aria-hidden className="absolute top-9 bottom-[-1.25rem] left-[1.05rem] w-px bg-ink-100" /> : null}
            <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", tone)}>
              <Icon aria-hidden className="size-4.5" />
            </span>
            <div className="min-w-0 pt-1">
              <p>
                <span className="font-semibold">{ACTION_LABEL[e.action]}</span> by {e.actorName}
              </p>
              <p className="text-sm text-ink-500">
                <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
              </p>
              {e.comment ? <p className="mt-1.5 rounded-[var(--radius-btn)] bg-surface px-3 py-2 text-ink-700">“{e.comment}”</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
