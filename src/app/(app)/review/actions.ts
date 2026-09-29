"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { approveClaims } from "@/lib/data/claims";
import { reviewQueue } from "@/lib/data/review";
import { errorMessage } from "@/lib/errors";

export type BulkState = { error?: string };

export async function bulkApprove(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const viewer = await requireRole("coordinator", "admin");
  const ids = formData.getAll("claim").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return { error: "Tick the claims you want to approve." };
  // Only small, unflagged claims can be approved without opening them.
  const { claims } = await reviewQueue(viewer);
  const simple = new Set(claims.filter((c) => c.simple).map((c) => c.id));
  if (ids.some((id) => !simple.has(id))) {
    return { error: "Some of those claims need a closer look. Open them to approve one at a time." };
  }
  let count = 0;
  try {
    count = await approveClaims(viewer, ids);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/review?done=bulk&count=${count}`);
}
