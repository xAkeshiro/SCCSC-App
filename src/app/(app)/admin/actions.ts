"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type Role } from "@/lib/auth/viewer";
import { ALL_ROLES, approveAccessRequest, rejectAccessRequest } from "@/lib/data/admin";
import { errorMessage } from "@/lib/errors";

export type ReviewState = { error?: string; done?: "approved" | "rejected" };

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.slice(0, max).trim() : "");

export async function approveRequest(requestId: string, _prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const viewer = await requireRole("admin");
  const roles = formData.getAll("roles").filter((r): r is Role => ALL_ROLES.includes(r as Role));
  if (roles.length === 0) return { error: "Choose at least one role." };
  const coordinatorId = str(formData.get("coordinatorId")) || null;
  const siteId = str(formData.get("siteId")) || null;
  try {
    await approveAccessRequest(viewer, { requestId, fullName: str(formData.get("fullName"), 120), roles, coordinatorId, siteId });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { done: "approved" };
}

export async function rejectRequest(requestId: string, _prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const viewer = await requireRole("admin");
  const note = str(formData.get("note"), 500);
  if (!note) return { error: "Add a short note. The person will see it." };
  try {
    await rejectAccessRequest(viewer, requestId, note);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { done: "rejected" };
}
