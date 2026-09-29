"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/viewer";
import { errorMessage } from "@/lib/errors";
import { safePath } from "@/lib/paths";
import { createTrip, deleteTrip, parseTripForm, updateTrip, type TripErrors } from "@/lib/requests/mileage";

export type SaveTripState = { errors?: TripErrors; message?: string };

export async function saveTrip(itemId: string | null, returnTo: string | null, _prev: SaveTripState, formData: FormData): Promise<SaveTripState> {
  const viewer = await requireRole("employee");
  const input = parseTripForm(formData);
  try {
    const result = itemId ? await updateTrip(viewer, itemId, input) : await createTrip(viewer, input);
    if ("errors" in result) return { errors: result.errors };
  } catch (err) {
    return { message: errorMessage(err) };
  }
  revalidatePath("/", "layout");
  if (formData.get("intent") === "another") redirect(`/trips/new?saved=${Date.now()}`);
  redirect(safePath(returnTo) ?? `/trips?saved=${itemId ? "updated" : "added"}`);
}

export async function removeTrip(itemId: string, returnTo: string | null) {
  const viewer = await requireRole("employee");
  let message: string | null = null;
  try {
    await deleteTrip(viewer, itemId);
  } catch (err) {
    message = errorMessage(err);
  }
  if (message) redirect(`/trips/${itemId}/edit?error=${encodeURIComponent(message)}`);
  revalidatePath("/", "layout");
  redirect(safePath(returnTo) ?? "/trips?saved=deleted");
}
