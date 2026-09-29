"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireViewer } from "@/lib/auth/viewer";
import { decideClaim, resubmitClaim, submitClaim, withdrawClaim, type Decision } from "@/lib/data/claims";
import { errorMessage } from "@/lib/errors";

export type ClaimFormState = { error?: string };

const str = (v: FormDataEntryValue | null, max = 1000) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const items = (formData: FormData) => formData.getAll("item").map((v) => str(v, 64));

const CERTIFY_MESSAGE = "Please tick the box to confirm these trips were for SCCSC business.";

export async function createClaim(_prev: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const viewer = await requireRole("employee");
  if (formData.get("certify") !== "on") return { error: CERTIFY_MESSAGE };
  let id: string;
  try {
    id = await submitClaim(viewer, items(formData), str(formData.get("note")));
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/claims/${id}?done=submitted`);
}

export async function resubmit(requestId: string, _prev: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const viewer = await requireRole("employee");
  if (formData.get("certify") !== "on") return { error: CERTIFY_MESSAGE };
  try {
    await resubmitClaim(viewer, requestId, items(formData), str(formData.get("note")));
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/claims/${requestId}?done=resubmitted`);
}

export async function withdraw(requestId: string) {
  const viewer = await requireRole("employee");
  let message: string | null = null;
  try {
    await withdrawClaim(viewer, requestId);
  } catch (err) {
    message = errorMessage(err);
  }
  revalidatePath("/", "layout");
  redirect(`/claims/${requestId}?${message ? `error=${encodeURIComponent(message)}` : "done=withdrawn"}`);
}

/** Approve, return or deny. Used by coordinators (and finance, to return an approved claim). */
export async function decide(requestId: string, _prev: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const viewer = await requireViewer();
  const decision = str(formData.get("decision"), 10) as Decision;
  if (!["approve", "return", "deny"].includes(decision)) return { error: "Choose approve, return or deny." };
  const comment = str(formData.get("comment"));
  if (decision !== "approve" && !comment) {
    return { error: decision === "return" ? "Say what needs to change, so they can fix it." : "Say why it's denied." };
  }
  try {
    await decideClaim(viewer, requestId, decision, comment);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  const next = formData.get("next") === "queue" ? "/review" : `/claims/${requestId}`;
  redirect(`${next}?done=${decision === "approve" ? "approved" : decision === "return" ? "returned" : "denied"}`);
}
