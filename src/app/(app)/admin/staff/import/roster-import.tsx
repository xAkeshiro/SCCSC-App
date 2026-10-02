"use client";

import { FileSpreadsheet, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, Notice } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import type { RosterPlanRow } from "@/lib/data/roster";
import { formatPhone } from "@/lib/phone";
import { importRosterAction, previewRosterAction, type RosterState } from "./actions";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RosterImport() {
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<File | null>(null);
  const [preview, onPreview, previewing] = useFormAction<RosterState>(previewRosterAction, {});
  const [imported, onImport, importing] = useFormAction<RosterState>(importRosterAction, {}, (fd) => {
    if (file) fd.set("file", file);
  });
  const plan = checked === file ? preview.plan : undefined;
  const ready = plan ? plan.counts.new + plan.counts.update : 0;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          setChecked(file);
          onPreview(e);
        }}
        className="space-y-4"
        noValidate
      >
        {preview.error && checked === file ? <Notice tone="error">{preview.error}</Notice> : null}
        <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-btn)] border-2 border-dashed border-ink-300 bg-white px-4 py-4 font-display font-medium text-brand-700 transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-brand-600 hover:bg-brand-50">
          <FileSpreadsheet aria-hidden className="size-5 shrink-0" />
          <span className="break-all">{file ? file.name : "Choose the staff list (.csv or .xlsx)"}</span>
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button type="submit" variant={plan ? "secondary" : "primary"} disabled={!file || previewing}>
          <Search aria-hidden className="size-4" /> {previewing ? "Reading the file…" : "Check the file"}
        </Button>
      </form>

      {plan ? (
        <section aria-labelledby="preview-heading" className="space-y-4">
          <h2 id="preview-heading" className="text-2xl">
            What will happen
          </h2>
          <p className="text-ink-700">
            Names from “{plan.columns.name}”
            {plan.columns.email ? `, emails from “${plan.columns.email}”` : ""}
            {plan.columns.phone ? `, mobile numbers from “${plan.columns.phone}”` : ""}.
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { n: plan.counts.new, label: "New people" },
              { n: plan.counts.update, label: "To update" },
              { n: plan.counts.same, label: "Already up to date" },
              { n: plan.counts.problem, label: "Can't be imported" },
            ].map((x) => (
              <div key={x.label} className="card px-4 py-3">
                <dt className="text-sm text-ink-500">{x.label}</dt>
                <dd className="font-display text-2xl font-semibold text-brand-600">{x.n}</dd>
              </div>
            ))}
          </dl>

          <Group title="New people" rows={plan.rows.filter((r) => r.kind === "new")} open>
            {(r) => <Contact row={r} />}
          </Group>
          <Group title="To update" rows={plan.rows.filter((r) => r.kind === "update")} open>
            {(r) => <span className="text-ink-700">Adds their {r.adds.join(" and ")}</span>}
          </Group>
          <Group title="Can't be imported" rows={plan.rows.filter((r) => r.kind === "problem")} open tone="problem">
            {(r) => <span className="font-semibold text-status-returned">{r.problems.join(". ")}</span>}
          </Group>
          <Group title="Already up to date" rows={plan.rows.filter((r) => r.kind === "same")}>
            {() => null}
          </Group>
          {plan.missing.length ? (
            <details className="card">
              <summary className="cursor-pointer px-5 py-4 font-display text-lg font-semibold">
                On the staff list but not in this file ({plan.missing.length})
              </summary>
              <div className="border-t border-ink-100 px-5 py-4">
                <p className="mb-2 text-sm text-ink-500">Nothing happens to them. If someone has left, make them inactive on their record.</p>
                <ul className="columns-1 gap-6 sm:columns-2">
                  {plan.missing.map((m) => (
                    <li key={m.id} className="py-0.5">
                      <Link href={`/admin/staff/${m.id}`} className="text-brand-600 hover:underline">
                        {m.fullName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}

          <form onSubmit={onImport} className="space-y-3">
            {imported.error ? <Notice tone="error">{imported.error}</Notice> : null}
            <Button type="submit" disabled={ready === 0 || importing}>
              <Upload aria-hidden className="size-4" />
              {importing
                ? "Importing…"
                : ready === 0
                  ? "Nothing to import"
                  : [plan.counts.new ? `Add ${plural(plan.counts.new, "person", "people")}` : null, plan.counts.update ? `update ${plan.counts.update}` : null]
                      .filter(Boolean)
                      .join(" and ")
                      .replace(/^update/, "Update")}
            </Button>
            {plan.counts.problem ? (
              <p className="text-sm text-ink-500">Rows that can&apos;t be imported are skipped. Fix them in the file and import it again, or add those people one at a time.</p>
            ) : null}
          </form>
        </section>
      ) : null}
    </div>
  );
}

function Contact({ row }: { row: RosterPlanRow }) {
  return <span className="break-all text-ink-500">{[row.email, row.phone ? formatPhone(row.phone) : null].filter(Boolean).join(" · ")}</span>;
}

function Group({
  title,
  rows,
  open = false,
  tone,
  children,
}: {
  title: string;
  rows: RosterPlanRow[];
  open?: boolean;
  tone?: "problem";
  children: (row: RosterPlanRow) => ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="card" open={open}>
      <summary className="cursor-pointer px-5 py-4 font-display text-lg font-semibold">
        {title} ({rows.length})
      </summary>
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {rows.map((r) => (
          <li key={r.line} className={tone === "problem" ? "bg-status-returned-bg px-5 py-2.5" : "px-5 py-2.5"}>
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-semibold">{r.fullName || "(no name)"}</span>
              <span className="text-xs text-ink-500">row {r.line}</span>
            </p>
            <p className="text-sm">{children(r)}</p>
            {[...r.kept, ...r.notes].map((k) => (
              <p key={k} className="text-sm text-ink-500">
                {k}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}
