"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { moveTeam, saveStaff } from "@/lib/data/staff";
import { errorMessage } from "@/lib/errors";
import { checkStaffInput, type StaffErrors } from "@/lib/staff";

export type StaffFormState = { error?: string; errors?: StaffErrors };

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.slice(0, max).trim() : "");

/** Adds a person (`id` null) or saves changes to one. */
export async function saveStaffMember(id: string | null, _prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const viewer = await requireRole("admin");
  const { input, errors } = checkStaffInput({
    fullName: str(formData.get("fullName")),
    email: str(formData.get("email"), 254),
    phone: str(formData.get("phone"), 40),
    roles: formData.getAll("roles").map((r) => String(r)),
    coordinatorId: str(formData.get("coordinatorId"), 64),
    siteId: str(formData.get("siteId"), 64),
    aplosName: str(formData.get("aplosName")),
    active: id === null || formData.get("status") !== "inactive",
  });
  if (!input) return { errors };
  let result: Awaited<ReturnType<typeof saveStaff>>;
  try {
    result = await saveStaff(viewer, id, input);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/staff/${result.staffId}?done=${id === null ? "added" : result.changes.length ? "saved" : "unchanged"}`);
}

export async function moveTeamTo(fromId: string, _prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const viewer = await requireRole("admin");
  const to = str(formData.get("to"), 64);
  if (!to) return { error: "Choose who reviews them now." };
  try {
    await moveTeam(viewer, fromId, to === "none" ? null : to);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/staff/${fromId}?done=moved`);
}
