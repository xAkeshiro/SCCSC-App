"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { useFormAction } from "@/components/use-form-action";
import { Button, Field, Notice } from "@/components/ui";
import { approveRequest, rejectRequest, type ReviewState } from "./actions";

type Props = {
  request: { id: string; fullName: string; phone: string; askedAgo: string; matchedName: string | null };
  coordinators: { id: string; fullName: string }[];
  programs: { id: string; code: string; name: string }[];
};

const ROLES = [
  { value: "employee", label: "Employee", hint: "Logs trips and submits claims" },
  { value: "coordinator", label: "Coordinator", hint: "Approves their team's claims" },
  { value: "finance", label: "Finance", hint: "Batches, exports and pays claims" },
  { value: "admin", label: "Admin", hint: "Manages people and settings" },
];

export function AccessRequestCard({ request, coordinators, programs }: Props) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [approved, approve, approving] = useFormAction<ReviewState>(approveRequest.bind(null, request.id), {});
  const [rejected, reject, rejecting] = useFormAction<ReviewState>(rejectRequest.bind(null, request.id), {});
  const id = request.id.slice(0, 8);

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-semibold">{request.fullName}</p>
          <p className="mt-0.5 text-ink-700">
            {request.phone} · <span className="text-ink-500">asked {request.askedAgo}</span>
          </p>
          {request.matchedName ? (
            <p className="mt-2 text-sm text-status-returned">
              This phone number is on the staff list as <strong>{request.matchedName}</strong>. Approving links them to that
              entry.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-500">Not on the staff list. Check their name and phone in Paychex before approving.</p>
          )}
        </div>
        {mode === "idle" ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setMode("approve")}>
              <Check aria-hidden className="size-4" /> Approve
            </Button>
            <Button size="sm" variant="danger" onClick={() => setMode("reject")}>
              <X aria-hidden className="size-4" /> Reject
            </Button>
          </div>
        ) : null}
      </div>

      {mode === "approve" ? (
        <form onSubmit={approve} className="mt-5 grid gap-5 border-t border-ink-100 pt-5 sm:grid-cols-2">
          {approved.error ? <Notice tone="error" className="sm:col-span-2">{approved.error}</Notice> : null}
          {!request.matchedName ? (
            <Field label="Name on the staff list" htmlFor={`name-${id}`} hint="Fix the spelling if needed." className="sm:col-span-2">
              <input id={`name-${id}`} name="fullName" defaultValue={request.fullName} className="field" required />
            </Field>
          ) : null}
          <fieldset className="sm:col-span-2">
            <legend className="field-label">Roles</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLES.map((r) => (
                <label key={r.value} className="flex min-h-12 items-start gap-3 rounded-[var(--radius-btn)] border border-ink-100 p-3 hover:bg-surface">
                  <input type="checkbox" name="roles" value={r.value} defaultChecked={r.value === "employee"} className="mt-1 size-5" />
                  <span>
                    <span className="block font-semibold">{r.label}</span>
                    <span className="block text-sm text-ink-500">{r.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Their coordinator" htmlFor={`coord-${id}`} hint="Approves their claims.">
            <select id={`coord-${id}`} name="coordinatorId" className="field" defaultValue="">
              <option value="">No coordinator (an admin reviews)</option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Usual program" htmlFor={`prog-${id}`} optional hint="Filled in on their new trips.">
            <select id={`prog-${id}`} name="programId" className="field" defaultValue="">
              <option value="">None</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}: {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={approving}>
              {approving ? "Approving…" : `Approve ${request.fullName.split(" ")[0]}`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "reject" ? (
        <form onSubmit={reject} className="mt-5 space-y-4 border-t border-ink-100 pt-5">
          <Field label="Why?" htmlFor={`note-${id}`} hint="They'll see this note." error={rejected.error}>
            <textarea id={`note-${id}`} name="note" rows={2} className="field" required />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={rejecting}>
              {rejecting ? "Rejecting…" : "Reject request"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
