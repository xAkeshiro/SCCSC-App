import type { Metadata } from "next";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { unclaimedTrips } from "@/lib/data/claims";
import { toPickable } from "@/lib/requests/pickable";
import { createClaim } from "../actions";
import { ClaimBuilder } from "../claim-builder";

export const metadata: Metadata = { title: "Submit trips" };

export default async function NewClaimPage() {
  const viewer = await requireRole("employee");
  const trips = await unclaimedTrips(viewer);

  return (
    <Container className="max-w-3xl py-8">
      <PageHeader
        eyebrow="Claims"
        title="Submit trips for approval"
        description="Your coordinator gets them as one claim, like the monthly spreadsheet. You'll see each step on the claim."
      />
      {trips.length === 0 ? (
        <EmptyState title="No trips to submit" action={<ButtonLink href="/trips/new">Log a trip</ButtonLink>}>
          Log your trips first, then come back here to send them.
        </EmptyState>
      ) : (
        <ClaimBuilder trips={trips.map((t) => toPickable(t))} action={createClaim} submitLabel="Submit claim" preselect="all" />
      )}
    </Container>
  );
}
