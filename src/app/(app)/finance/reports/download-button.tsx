"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { saveCsv } from "@/components/download";
import { Button, Notice } from "@/components/ui";
import { exportReportFile } from "../actions";

export function ReportDownloadButton({ query }: { query: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const file = await exportReportFile(query);
            if (!file.ok) throw new Error(file.error);
            saveCsv(file.filename, file.csv);
          } catch (err) {
            setError(err instanceof Error ? err.message : "The file couldn't be made. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download aria-hidden className="size-4" /> {busy ? "Preparing…" : "Download details (CSV)"}
      </Button>
    </div>
  );
}
