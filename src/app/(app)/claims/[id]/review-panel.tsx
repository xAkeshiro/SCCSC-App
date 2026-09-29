"use client";

import { CheckCircle2, RotateCcw, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Button, Field, Notice, cx } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { formatCents } from "@/lib/money";
import { decide, type ClaimFormState } from "../actions";

const CHOICES = [
  { value: "approve", label: "Approve", hint: "Send it to finance for payment.", Icon: CheckCircle2, tone: "text-status-approved" },
  { value: "return", label: "Return for changes", hint: "They fix it and send it again.", Icon: RotateCcw, tone: "text-status-returned" },
  { value: "deny", label: "Deny", hint: "It won't be paid.", Icon: XCircle, tone: "text-status-denied" },
] as const;

/**
 * The approver's decision, replacing the wet signature. It's recorded with their name and the
 * time. "return-approved" is for sending back a claim that was approved but not yet paid.
 */
export function ReviewPanel({
  requestId,
  ownerName,
  totalCents,
  mode,
  flagged,
}: {
  requestId: string;
  ownerName: string;
  totalCents: number;
  mode: "review" | "return-approved";
  flagged: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction<ClaimFormState>(decide.bind(null, requestId), {});
  const [decision, setDecision] = useState<(typeof CHOICES)[number]["value"]>(mode === "review" ? "approve" : "return");
  const [comment, setComment] = useState("");
  const first = ownerName.split(" ")[0];
  const choices = mode === "review" ? CHOICES : CHOICES.filter((c) => c.value === "return");

  return (
    <section aria-labelledby="decide" className="card border-2 border-brand-600/25 p-5 sm:p-6">
      <h2 id="decide" className="text-2xl">
        {mode === "review" ? "Your decision" : "Send it back?"}
      </h2>
      <p className="mt-1 text-ink-500">
        {mode === "review"
          ? `${ownerName} is claiming ${formatCents(totalCents)}. Your decision is recorded with your name and the time.`
          : `This claim is approved but not paid yet. If something is wrong, return it to ${first} with a comment.`}
      </p>
      {flagged && mode === "review" ? (
        <Notice tone="warning" className="mt-4">
          <span className="flex gap-2">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            Some trips are flagged (a home start or changed miles). Check them below before approving.
          </span>
        </Notice>
      ) : null}
      <form onSubmit={onSubmit} className="mt-5 space-y-5" noValidate>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        {choices.length > 1 ? (
          <fieldset>
            <legend className="sr-only">Decision</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {choices.map((c) => (
                <label
                  key={c.value}
                  className={cx(
                    "flex min-h-14 cursor-pointer items-start gap-3 rounded-[var(--radius-btn)] border p-3 transition-colors",
                    decision === c.value ? "border-ink bg-surface" : "border-ink-100 hover:bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="decision"
                    value={c.value}
                    checked={decision === c.value}
                    onChange={() => setDecision(c.value)}
                    className="mt-1 size-4.5"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold">
                      <c.Icon aria-hidden className={cx("size-4", c.tone)} /> {c.label}
                    </span>
                    <span className="block text-sm text-ink-500">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <input type="hidden" name="decision" value="return" />
        )}
        <Field
          label={decision === "approve" ? "Comment" : decision === "return" ? `What should ${first} change?` : "Why is it denied?"}
          htmlFor="comment"
          optional={decision === "approve"}
          hint={decision === "approve" ? undefined : `${first} will see this.`}
        >
          <textarea id="comment" name="comment" rows={3} className="field" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <Button type="submit" disabled={pending} variant={decision === "deny" ? "danger" : "primary"}>
          {pending
            ? "Saving…"
            : decision === "approve"
              ? `Approve ${formatCents(totalCents)}`
              : decision === "return"
                ? `Return to ${first}`
                : "Deny claim"}
        </Button>
      </form>
    </section>
  );
}
