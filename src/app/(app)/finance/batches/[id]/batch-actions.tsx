"use client";

import { CircleDollarSign, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { saveBase64, saveCsv } from "@/components/download";
import { exportAplosFile, exportBatchFile, markPaid, type FinanceState } from "../../actions";

/** Downloads the Aplos payments or the trip detail, then refreshes the page to show it was exported. */
export function ExportButtons({ batchId, defaultDate, problems }: { batchId: string; defaultDate: string; problems: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"aplos" | "detail" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [firstCheck, setFirstCheck] = useState("");

  async function download(kind: "aplos" | "detail") {
    if (kind === "aplos" && problems > 0 && !window.confirm(`${problems === 1 ? "1 line needs" : `${problems} lines need`} a look (see Payments for Aplos). Download anyway and fix it in Aplos?`)) {
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      if (kind === "aplos") {
        const file = await exportAplosFile(batchId, { date, firstCheck });
        if (!file.ok) throw new Error(file.error);
        saveBase64(file.filename, file.base64, file.contentType);
      } else {
        const file = await exportBatchFile(batchId);
        if (!file.ok) throw new Error(file.error);
        saveCsv(file.filename, file.csv);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file couldn't be made. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="grid grid-cols-2 items-end gap-3">
        <Field label="Payment date" htmlFor="payment_date">
          <input id="payment_date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={<>First check # <span className="font-normal text-ink-500">(optional)</span></>} htmlFor="first_check">
          <input
            id="first_check"
            inputMode="numeric"
            autoComplete="off"
            className="field"
            value={firstCheck}
            onChange={(e) => setFirstCheck(e.target.value.replace(/\D/g, "").slice(0, 9))}
            aria-describedby="first_check-hint"
          />
        </Field>
      </div>
      <p id="first_check-hint" className="-mt-2 text-sm text-ink-500">
        With a first check number, each payment gets the next one, in the order shown.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => download("aplos")} disabled={busy !== null}>
          <Download aria-hidden className="size-4" /> {busy === "aplos" ? "Preparing…" : "Aplos payments (Excel)"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => download("detail")} disabled={busy !== null}>
          <Download aria-hidden className="size-4" /> {busy === "detail" ? "Preparing…" : "Trip detail (CSV)"}
        </Button>
      </div>
      <p className="text-sm text-ink-500">
        The Excel file is for the register import in Aplos: one payment per person, a row for each budget code. Trip detail has one row
        per trip or phone month, for your records.
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
