"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import { ACCOUNT_MAPPING_LABELS } from "@/lib/budget-codes";
import type { AccountMapping } from "@/lib/settings";
import { importFromAplos, saveMapping, type ImportState, type MappingState } from "./actions";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ImportForm() {
  const [state, onSubmit, pending] = useFormAction<ImportState>(importFromAplos, {});
  const [fileName, setFileName] = useState("");
  const s = state.summary;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {s ? (
        <Notice tone="success" title="Budget codes updated from Aplos">
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Funds: {plural(s.funds.added, "new one")}, {s.funds.updated} updated</li>
            <li>Accounts: {plural(s.accounts.added, "new one")}, {s.accounts.updated} updated</li>
            <li>Schools and sites: {plural(s.sites.added, "new one")}, {s.sites.updated} updated</li>
            {s.notInFile ? <li>{plural(s.notInFile, "school or site", "schools and sites")} in the app weren&apos;t in the file. They were left as they are.</li> : null}
            {s.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-btn)] border-2 border-dashed border-ink-300 px-4 py-3 font-display font-medium text-brand-700 transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-brand-600 hover:bg-brand-50">
        <FileSpreadsheet aria-hidden className="size-5" />
        {fileName || "Choose the Aplos template (.xlsx)"}
        <input
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
      </label>
      <Button type="submit" disabled={pending || !fileName}>
        <Upload aria-hidden className="size-4" />
        {pending ? "Reading the file…" : "Update from this file"}
      </Button>
    </form>
  );
}

type AccountOption = { number: string; name: string; parentNumber: string | null };

const LINES: { key: keyof AccountMapping; label: string; hint: string }[] = [
  { key: "mileageDirect", label: ACCOUNT_MAPPING_LABELS.mileageDirect, hint: "Trips directly involved with students." },
  { key: "mileageIndirect", label: ACCOUNT_MAPPING_LABELS.mileageIndirect, hint: "Meetings, trainings, materials runs." },
  { key: "parkingDirect", label: ACCOUNT_MAPPING_LABELS.parkingDirect, hint: "Parking on a direct trip." },
  { key: "parkingIndirect", label: ACCOUNT_MAPPING_LABELS.parkingIndirect, hint: "Parking on an indirect trip." },
  { key: "phone", label: ACCOUNT_MAPPING_LABELS.phone, hint: "The $45 a month for using a personal phone." },
];

export function MappingForm({ mapping, accounts, exampleFund, exampleSite }: { mapping: AccountMapping; accounts: AccountOption[]; exampleFund: string; exampleSite: string }) {
  const [state, onSubmit, pending] = useFormAction<MappingState>(saveMapping, {});
  const [values, setValues] = useState(mapping);
  // Accounts under their parent (8550 - Local Travel …), as in Aplos. A parent that's an account
  // itself is listed in its own group too.
  const byNumber = new Map(accounts.map((a) => [a.number, a]));
  const groups = new Map<string, { label: string; options: AccountOption[] }>();
  for (const a of accounts) {
    const isParent = accounts.some((c) => c.parentNumber === a.number);
    const key = a.parentNumber ?? (isParent ? a.number : "other");
    const parent = byNumber.get(key);
    const label = key === "other" ? "Other accounts" : parent ? `${parent.number} - ${parent.name}` : `Under ${key}`;
    const group = groups.get(key) ?? { label, options: [] };
    group.options.push(a);
    groups.set(key, group);
  }
  const known = new Set(accounts.map((a) => a.number));
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.saved ? <Notice tone="success">Saved. New payments use these accounts.</Notice> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        {LINES.map((line) => (
          <Field
            key={line.key}
            label={line.label}
            htmlFor={line.key}
            hint={`${line.hint} Budget code like ${values[line.key] || "?"}-${exampleFund}-${exampleSite}.`}
            error={known.has(values[line.key]) ? undefined : "This account isn't in the imported list."}
          >
            <select
              id={line.key}
              name={line.key}
              className="field"
              value={values[line.key]}
              onChange={(e) => setValues((v) => ({ ...v, [line.key]: e.target.value }))}
            >
              {known.has(values[line.key]) ? null : <option value={values[line.key]}>{values[line.key]} (not imported)</option>}
              {[...groups.entries()].map(([key, g]) => (
                <optgroup key={key} label={g.label}>
                  {g.options.map((a) => (
                    <option key={a.number} value={a.number}>
                      {a.number} - {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save accounts"}
      </Button>
    </form>
  );
}
