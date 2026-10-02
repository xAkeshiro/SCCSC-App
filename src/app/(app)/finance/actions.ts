"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { dollars, toCsv } from "@/lib/csv";
import { addToBatch, batchDetail, createBatch, markBatchExported, markBatchPaid, reimbursementReport, removeFromBatch } from "@/lib/data/finance";
import { errorMessage } from "@/lib/errors";
import { batchCsv } from "@/lib/requests/export";
import { parseReportFilters } from "@/lib/requests/report-filters";
import { STATUS_LABEL, batchNumber, claimNumber } from "@/lib/requests/status";
import { REQUEST_TYPES } from "@/lib/requests/types";
import { siteLabel } from "@/lib/sites";

export type FinanceState = { error?: string };

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.slice(0, max).trim() : "");

/** Puts the ticked approved claims into a new batch, or an open one. */
export async function batchClaims(_prev: FinanceState, formData: FormData): Promise<FinanceState> {
  const viewer = await requireRole("finance", "admin");
  const claimIds = formData.getAll("claim").map((v) => str(v, 64));
  const target = str(formData.get("target"), 64);
  let batchId: string;
  try {
    if (target && target !== "new") {
      await addToBatch(viewer, target, claimIds);
      batchId = target;
    } else {
      batchId = await createBatch(viewer, {
        start: str(formData.get("period_start"), 10),
        end: str(formData.get("period_end"), 10),
        claimIds,
        note: str(formData.get("note"), 500),
      });
    }
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/finance/batches/${batchId}?done=${target && target !== "new" ? "added" : "created"}`);
}

export async function unbatchClaim(batchId: string, claimId: string) {
  const viewer = await requireRole("finance", "admin");
  let message: string | null = null;
  try {
    await removeFromBatch(viewer, claimId);
  } catch (err) {
    message = errorMessage(err);
  }
  revalidatePath("/", "layout");
  redirect(`/finance/batches/${batchId}?${message ? `error=${encodeURIComponent(message)}` : "done=removed"}`);
}

export async function markPaid(batchId: string, _prev: FinanceState, formData: FormData): Promise<FinanceState> {
  const viewer = await requireRole("finance", "admin");
  try {
    await markBatchPaid(viewer, batchId, str(formData.get("paid_on"), 10));
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/finance/batches/${batchId}?done=paid`);
}

export type CsvFile = { ok: true; filename: string; csv: string } | { ok: false; error: string };

/**
 * The batch file for the financial system. Recording the export freezes the batch.
 * A server action (not a route handler) so that, in the demo, it runs next to the pages and
 * sees the same in-memory database.
 */
export async function exportBatchFile(batchId: string, format: "detail" | "summary"): Promise<CsvFile> {
  const viewer = await requireRole("finance", "admin");
  const batch = await batchDetail(viewer, batchId);
  if (!batch) return { ok: false, error: "Batch not found." };
  if (batch.claims.length === 0) return { ok: false, error: "This batch has no claims to export." };
  try {
    await markBatchExported(viewer, batchId);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  revalidatePath("/finance", "layout");
  const layout = format === "summary" ? "summary" : "detail";
  return { ok: true, filename: `${batchNumber(batch.ref)}-${layout}.csv`, csv: batchCsv(batch, layout) };
}

/** The report's lines (trips and phone bill months) as a CSV, for the filters in `query` (the report page's URL query). */
export async function exportReportFile(query: string): Promise<CsvFile> {
  const viewer = await requireRole("finance", "admin");
  const search = new URLSearchParams(query.slice(0, 2000));
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(search.keys())) {
    const all = search.getAll(key);
    params[key] = all.length > 1 ? all : all[0];
  }
  const filters = parseReportFilters(params);
  const report = await reimbursementReport(viewer, filters);
  const csv = toCsv(
    ["Type", "Date", "Employee", "Business purpose", "Route or month", "District", "School or site", "Claim", "Claim status", "Miles", "Amount"],
    report.lines.map((t) => [
      REQUEST_TYPES[t.type].label,
      t.date,
      t.ownerName,
      t.purpose,
      t.detail,
      t.fundName ?? "",
      t.siteCode ? siteLabel({ code: t.siteCode, name: t.siteName ?? "" }) : "",
      claimNumber(t.claimRef, t.type),
      STATUS_LABEL[t.claimStatus],
      t.miles === null ? "" : t.miles.toFixed(1),
      dollars(t.amountCents),
    ]),
  );
  return { ok: true, filename: `reimbursements-${filters.from}-to-${filters.to}.csv`, csv };
}
