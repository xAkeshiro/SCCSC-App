"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { addPlace, removePlace } from "@/lib/data/places";
import { errorMessage } from "@/lib/errors";

export type PlaceState = { errors?: { label?: string; address?: string }; message?: string; added?: number };

const str = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

export async function createPlace(_prev: PlaceState, formData: FormData): Promise<PlaceState> {
  const viewer = await requireRole("employee");
  const label = str(formData.get("label"), 60);
  const address = str(formData.get("address"), 300);
  const errors: PlaceState["errors"] = {};
  if (label.length < 2) errors.label = "Give the place a short name, like “Home” or “Food bank”.";
  if (address.length < 5) errors.address = "Enter the street address.";
  if (errors.label || errors.address) return { errors };
  try {
    await addPlace(viewer, { label, address, isHome: formData.get("is_home") === "on" });
  } catch (err) {
    return { message: errorMessage(err) };
  }
  revalidatePath("/trips/places");
  return { added: Date.now() };
}

export async function deletePlace(placeId: string) {
  const viewer = await requireRole("employee");
  let message: string | null = null;
  try {
    await removePlace(viewer, placeId);
  } catch (err) {
    message = errorMessage(err);
  }
  revalidatePath("/trips/places");
  redirect(message ? `/trips/places?error=${encodeURIComponent(message)}` : "/trips/places");
}
