"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { addRate, deleteRate, saveRules } from "@/lib/data/rates";
import { errorMessage } from "@/lib/errors";
import { RATE_TYPES, checkRules, parseRate, type RateType, type RulesErrors } from "@/lib/rules";

export type RateState = { error?: string; fields?: { rate?: string; effectiveFrom?: string } };
export type RulesState = { error?: string; errors?: RulesErrors };

const str = (v: FormDataEntryValue | null, max = 200) => (typeof v === "string" ? v.slice(0, max).trim() : "");

export async function addRateAction(type: RateType, _prev: RateState, formData: FormData): Promise<RateState> {
  const viewer = await requireRole("admin");
  if (!(type in RATE_TYPES)) return { error: "Choose which rate this is." };
  const rateCents = parseRate(str(formData.get("rate"), 20), type);
  const effectiveFrom = str(formData.get("effectiveFrom"), 10);
  const fields: RateState["fields"] = {};
  if (!rateCents) fields.rate = `Enter the rate in dollars, like ${RATE_TYPES[type].example}.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) fields.effectiveFrom = "Enter the date it starts.";
  if (fields.rate || fields.effectiveFrom) return { fields };
  try {
    await addRate(viewer, { type, rateCents: rateCents!, effectiveFrom, note: str(formData.get("note"), 300) });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/rates?done=rate#${type}`);
}

export async function deleteRateAction(id: string) {
  const viewer = await requireRole("admin");
  let message: string | null = null;
  try {
    await deleteRate(viewer, id);
  } catch (err) {
    message = errorMessage(err);
  }
  revalidatePath("/", "layout");
  redirect(`/admin/rates?${message ? `error=${encodeURIComponent(message)}` : "done=deleted"}`);
}

export async function saveRulesAction(_prev: RulesState, formData: FormData): Promise<RulesState> {
  const viewer = await requireRole("admin");
  const { rules, errors } = checkRules({
    homeTripRule: str(formData.get("homeTripRule")),
    bulkApproveMaxCents: str(formData.get("bulkApproveMax"), 20),
    requireSite: formData.get("requireSite") === "on",
    maxTripAgeDays: str(formData.get("maxTripAgeDays"), 10),
    sessionDays: str(formData.get("sessionDays"), 10),
    phoneMonthsPerClaim: str(formData.get("phoneMonthsPerClaim"), 10),
    phonePeriodsBack: str(formData.get("phonePeriodsBack"), 10),
  });
  if (!rules) return { errors };
  let changes: string[];
  try {
    changes = await saveRules(viewer, rules);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/admin/rates?done=${changes.length ? "rules" : "unchanged"}#rules`);
}
