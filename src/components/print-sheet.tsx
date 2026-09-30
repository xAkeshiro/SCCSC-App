import Image from "next/image";
import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import { PrintButton } from "./print-button";

/** A letter-size page with the SCCSC header, used for printable claims and batches. */
export function PrintSheet({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[8.5in] px-6 py-8 text-[13px] leading-relaxed text-ink print:px-0 print:py-0">
      <div className="no-print mb-6 flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface p-4">
        <p className="text-sm text-ink-500">This page is formatted for printing. Use your browser to print or save it as a PDF.</p>
        <PrintButton />
      </div>
      <header className="flex items-start justify-between gap-6 border-b-2 border-brand-600 pb-4">
        <div className="flex items-center gap-3">
          <Image src="/brand/thecenter-logo.svg" alt="The Center: Sacramento Chinese Community Service Center" width={950} height={254} className="h-11 w-auto" />
        </div>
        <div className="text-right">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          {subtitle ? <div className="text-ink-500">{subtitle}</div> : null}
        </div>
      </header>
      <div className="mt-5 space-y-6">{children}</div>
      <footer className="mt-10 border-t border-ink-100 pt-3 text-[11px] text-ink-500">
        Printed {formatDateTime(new Date())} from the SCCSC staff app. Approvals are electronic: each one is recorded with the
        approver&apos;s name and the time, and the full history is kept in the app.
      </footer>
    </div>
  );
}
