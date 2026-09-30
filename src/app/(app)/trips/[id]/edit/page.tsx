import { Lock, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { ButtonLink, Container, Notice, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { myTrip } from "@/lib/data/trips";
import { safePath } from "@/lib/paths";
import { tripFormOptions } from "@/lib/requests/mileage";
import { claimNumber } from "@/lib/requests/status";
import { removeTrip, saveTrip } from "../../actions";
import { TripForm } from "../../trip-form";

export const metadata: Metadata = { title: "Edit trip" };

export default async function EditTripPage({ params, searchParams }: PageProps<"/trips/[id]/edit">) {
  const viewer = await requireRole("employee");
  const { id } = await params;
  const { error, returnTo: rawReturn } = await searchParams;
  const found = await myTrip(viewer, id);
  if (!found) notFound();
  const { trip, claim, editable } = found;
  // Where to go after saving: the claim it's in, or the trips list (with a "saved" message).
  const returnTo = safePath(typeof rawReturn === "string" ? rawReturn : null) ?? (claim ? `/claims/${claim.id}` : null);
  const backHref = returnTo ?? "/trips";

  if (!editable) {
    return (
      <Container className="max-w-3xl py-8">
        <PageHeader eyebrow="Mileage" title="This trip is locked" />
        <Notice tone="info" title={claim ? `It's in claim ${claimNumber(claim.ref, "mileage")}` : undefined}>
          <span className="flex items-center gap-2">
            <Lock aria-hidden className="size-4" />
            Trips can&apos;t change once their claim is sent for approval. If something is wrong, ask your coordinator to return
            the claim to you.
          </span>
        </Notice>
        {claim ? (
          <div className="mt-6 flex items-center gap-3">
            <ButtonLink href={`/claims/${claim.id}`} variant="secondary">
              Open claim {claimNumber(claim.ref, "mileage")}
            </ButtonLink>
            <StatusBadge status={claim.status} />
          </div>
        ) : null}
      </Container>
    );
  }

  const options = await tripFormOptions(viewer);
  const point = (placeId: string | null, address: string | null) =>
    placeId && options.places.some((p) => p.id === placeId) ? { place: placeId, address: "" } : { place: "other", address: address ?? "" };

  return (
    <Container className="max-w-3xl py-8">
      <PageHeader
        eyebrow="Mileage"
        title="Edit trip"
        description={claim ? `This trip is in claim ${claimNumber(claim.ref, "mileage")}, which was returned to you.` : "This trip hasn't been submitted yet."}
        actions={
          <form action={removeTrip.bind(null, trip.id, returnTo)}>
            <ConfirmButton variant="danger" size="sm" confirm="Delete this trip? This can't be undone.">
              <Trash2 aria-hidden className="size-4" /> Delete trip
            </ConfirmButton>
          </form>
        }
      />
      {typeof error === "string" ? (
        <Notice tone="error" className="mb-6">
          {error}
        </Notice>
      ) : null}
      <TripForm
        options={options}
        action={saveTrip.bind(null, trip.id, returnTo)}
        submitLabel="Save changes"
        cancelHref={backHref}
        initial={{
          date: trip.date,
          from: point(trip.fromPlaceId, trip.fromAddress),
          stops: trip.stops.map((s) => point(s.placeId, s.address)),
          to: point(trip.toPlaceId, trip.toAddress),
          roundTrip: trip.roundTrip,
          // Miles that came from the estimate follow route changes; typed or changed miles stay put.
          miles: trip.overrideReason || trip.milesEstimated === null ? trip.miles : null,
          overrideReason: trip.overrideReason ?? "",
          purpose: trip.purpose,
          programId: trip.programId ?? "",
          notes: trip.notes ?? "",
        }}
      />
      <p className="mt-6 text-sm text-ink-500">
        <Link href={backHref} className="underline underline-offset-4">
          Back without saving
        </Link>
      </p>
    </Container>
  );
}
