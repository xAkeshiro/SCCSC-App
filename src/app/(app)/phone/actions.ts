"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { claimPhoneBill, resubmitPhoneClaim } from "@/lib/data/phone";
import { errorMessage } from "@/lib/errors";
import type { PickerState } from "./month-picker";

const str = (v: FormDataEntryValue | null, max = 1000) => (typeof v === "string" ? v.slice(0, max).trim() : "");

const CERTIFY_MESSAGE = "Please tick the box to confirm you used your own phone for SCCSC work.";

export async function claimPhone(_prev: PickerState, formData: FormData): Promise<PickerState> {
  const viewer = await requireRole("employee");
  if (formData.get("certify") !== "on") return { error: CERTIFY_MESSAGE };
  let id: string;
  try {
    id = await claimPhoneBill(viewer, {
      months: formData.getAll("month").map((v) => str(v, 10)),
      programId: str(formData.get("programId"), 64) || null,
      note: str(formData.get("note")),
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/claims/${id}?done=submitted`);
}

export async function resubmitPhone(requestId: string, _prev: PickerState, formData: FormData): Promise<PickerState> {
  const viewer = await requireRole("employee");
  if (formData.get("certify") !== "on") return { error: CERTIFY_MESSAGE };
  try {
    await resubmitPhoneClaim(viewer, requestId, formData.getAll("item").map((v) => str(v, 64)), str(formData.get("note")));
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/claims/${requestId}?done=resubmitted`);
}
