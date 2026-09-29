"use client";

import { CircleDollarSign, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { markPaid, type FinanceState } from "../../actions";

/** Downloads the batch file, then refreshes the page to show it was exported. */
export function ExportButtons({ batchId, batchName }: { batchId: string; batchName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: "detail" | "summary") {
    setBusy(format);
    setError(null);
    try {
      const body = new FormData();
      body.set("format", format);
      const res = await fetch(`/finance/batches/${batchId}/export`, { method: "POST", body });
      if (!res.ok) throw new Error((await res.text()) || "The file couldn't be made. Please try again.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${batchName}-${format}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file couldn't be made. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => download("detail")} disabled={busy !== null}>
          <Download aria-hidden className="size-4" /> {busy === "detail" ? "Preparing…" : "Trip detail (CSV)"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => download("summary")} disabled={busy !== null}>
          <Download aria-hidden className="size-4" /> {busy === "summary" ? "Preparing…" : "Summary (CSV)"}
        </Button>
      </div>
      <p className="text-sm text-ink-500">
        Trip detail has one row per trip. Summary has one row per employee and program.
      </p>
    </div>
  );
}

export function MarkPaidForm({ batchId, today, total }: { batchId: string; today: string; total: string }) {
  const [state, onSubmit, pending] = useFormAction<FinanceState>(markPaid.bind(null, batchId), {});
  const [paidOn, setPaidOn] = useState(today);
  return (
    <form
      onSubmit={(e) => {
        if (!window.confirm(`Mark this batch (${total}) as paid on ${paidOn}? Everyone in it will see their claim as paid.`)) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className="flex flex-wrap items-end gap-3"
      noValidate
    >
      {state.error ? <Notice tone="error" className="w-full">{state.error}</Notice> : null}
      <Field label="Paid on" htmlFor="paid_on">
        <input id="paid_on" name="paid_on" type="date" className="field" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending}>
        <CircleDollarSign aria-hidden className="size-4" /> {pending ? "Saving…" : "Mark as paid"}
      </Button>
    </form>
  );
}
