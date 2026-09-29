"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { addToBatch, createBatch, markBatchPaid, removeFromBatch } from "@/lib/data/finance";
import { errorMessage } from "@/lib/errors";

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
