"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/viewer";
import { importAplosLists, saveAccountMapping, setFundSitesActive, setSiteActive, type ImportSummary } from "@/lib/data/budget-codes";
import { errorMessage } from "@/lib/errors";
import type { AccountMapping } from "@/lib/settings";

export type ImportState = { error?: string; summary?: ImportSummary };
export type MappingState = { error?: string; saved?: boolean };

const MAX_BYTES = 4 * 1024 * 1024;

export async function importFromAplos(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const viewer = await requireRole("admin");
  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) return { error: "Choose the register import template you downloaded from Aplos." };
  if (file.size > MAX_BYTES) return { error: "That file is too big for the Aplos template. Please check it's the right one." };
  try {
    const summary = await importAplosLists(viewer, new Uint8Array(await file.arrayBuffer()));
    revalidatePath("/", "layout");
    return { summary };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.slice(0, 12).trim() : "");

export async function saveMapping(_prev: MappingState, formData: FormData): Promise<MappingState> {
  const viewer = await requireRole("admin");
  const mapping: AccountMapping = {
    mileageDirect: str(formData.get("mileageDirect")),
    mileageIndirect: str(formData.get("mileageIndirect")),
    parkingDirect: str(formData.get("parkingDirect")),
    parkingIndirect: str(formData.get("parkingIndirect")),
    phone: str(formData.get("phone")),
  };
  try {
    await saveAccountMapping(viewer, mapping);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/admin/budget-codes");
  return { saved: true };
}

export async function toggleSite(siteId: string, active: boolean) {
  const viewer = await requireRole("admin");
  await setSiteActive(viewer, siteId, active);
  revalidatePath("/", "layout");
}

export async function toggleFund(fundCode: string, active: boolean) {
  const viewer = await requireRole("admin");
  await setFundSitesActive(viewer, fundCode, active);
  revalidatePath("/", "layout");
}
