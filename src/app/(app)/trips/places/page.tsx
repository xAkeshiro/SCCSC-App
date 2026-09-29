import { Home, MapPin, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, Container, Notice, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { placesFor } from "@/lib/data/places";
import { deletePlace } from "./actions";
import { PlaceForm } from "./place-form";

export const metadata: Metadata = { title: "My places" };

export default async function PlacesPage({ searchParams }: PageProps<"/trips/places">) {
  const viewer = await requireRole("employee");
  const { error } = await searchParams;
  const { shared, mine } = await placesFor(viewer);

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Mileage"
        title="Places"
        description="Places you drive to often, so logging a trip is a couple of taps."
      />
      {typeof error === "string" ? (
        <Notice tone="error" className="mb-6">
          {error}
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="mine" className="space-y-4">
          <h2 id="mine" className="text-2xl">
            My places
          </h2>
          {mine.length === 0 ? <p className="text-ink-500">You haven&apos;t saved any places yet.</p> : null}
          <ul className="grid grid-cols-1 gap-2">
            {mine.map((p) => (
              <li key={p.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 gap-3">
                  {p.isHome ? (
                    <Home aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
                  ) : (
                    <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">{p.label}</p>
                    <p className="truncate text-sm text-ink-500">{p.address}</p>
                    {p.isHome ? <p className="text-sm text-ink-500">Shown to others as “Home”.</p> : null}
                  </div>
                </div>
                <form action={deletePlace.bind(null, p.id)}>
                  <ConfirmButton variant="ghost" size="sm" confirm={`Remove “${p.label}” from your places?`}>
                    <Trash2 aria-hidden className="size-4" />
                    <span className="sr-only">Remove {p.label}</span>
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
          <Card className="p-5 sm:p-6">
            <h3 className="mb-4 text-xl">Add a place</h3>
            <PlaceForm />
            <p className="mt-4 text-sm text-ink-500">
              In this demo, miles are estimated only between the shared places. For your own places, enter the miles from
              your odometer or map app. A maps service will fill them in later.
            </p>
          </Card>
        </section>

        <section aria-labelledby="shared" className="space-y-4">
          <h2 id="shared" className="text-2xl">
            Shared places
          </h2>
          <p className="text-ink-500">Offices and program sites everyone can pick. Admins keep this list up to date.</p>
          <ul className="card divide-y divide-ink-100">
            {shared.map((p) => (
              <li key={p.id} className="flex gap-3 px-5 py-3">
                <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-500" />
                <div>
                  <p className="font-semibold">{p.label}</p>
                  <p className="text-sm text-ink-500">{p.address}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Container>
  );
}
