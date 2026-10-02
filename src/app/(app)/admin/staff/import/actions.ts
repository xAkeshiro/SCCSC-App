"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { importRoster, previewRoster, type RosterPlan } from "@/lib/data/roster";
import { errorMessage } from "@/lib/errors";

export type RosterState = { error?: string; plan?: RosterPlan };

const MAX_BYTES = 4 * 1024 * 1024;

async function fileBytes(formData: FormData) {
  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) return { error: "Choose the staff list file (CSV or Excel)." };
  if (file.size > MAX_BYTES) return { error: "That file is bigger than 4 MB. Export only the name, email and phone columns." };
  return { bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Reads the file and shows what importing it would do. Changes nothing. */
export async function previewRosterAction(_prev: RosterState, formData: FormData): Promise<RosterState> {
  const viewer = await requireRole("admin");
  const file = await fileBytes(formData);
  if (!file.bytes) return { error: file.error };
  try {
    return { plan: await previewRoster(viewer, file.bytes) };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/** Imports the same file. The plan is worked out again on the server, from the file. */
export async function importRosterAction(_prev: RosterState, formData: FormData): Promise<RosterState> {
  const viewer = await requireRole("admin");
  const file = await fileBytes(formData);
  if (!file.bytes) return { error: file.error };
  let result: Awaited<ReturnType<typeof importRoster>>;
  try {
    result = await importRoster(viewer, file.bytes);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/staff?imported=${result.added}-${result.updated}`);
}
