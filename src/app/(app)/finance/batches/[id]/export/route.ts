import { notFound } from "next/navigation";
import { hasRole, getViewer } from "@/lib/auth/viewer";
import { csvResponse } from "@/lib/csv";
import { batchDetail, markBatchExported } from "@/lib/data/finance";
import { errorMessage } from "@/lib/errors";
import { batchCsv } from "@/lib/requests/export";
import { batchNumber } from "@/lib/requests/status";

/**
 * Downloads a batch file and records the export, which freezes the batch's claims.
 * POST (from a form on the batch page), since it changes the batch.
 */
export async function POST(request: Request, ctx: RouteContext<"/finance/batches/[id]/export">) {
  const viewer = await getViewer();
  if (!viewer || !hasRole(viewer, "finance", "admin")) notFound();
  // Same-site forms only.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await ctx.params;
  const form = await request.formData();
  const format = form.get("format") === "summary" ? "summary" : "detail";

  const batch = await batchDetail(viewer, id);
  if (!batch) notFound();
  if (batch.claims.length === 0) return new Response("This batch has no claims to export.", { status: 400 });
  try {
    await markBatchExported(viewer, id);
  } catch (err) {
    return new Response(errorMessage(err), { status: 400 });
  }
  return csvResponse(`${batchNumber(batch.ref)}-${format}.csv`, batchCsv(batch, format));
}
