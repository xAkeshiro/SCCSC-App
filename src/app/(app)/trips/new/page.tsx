import type { Metadata } from "next";
import { Container, Notice, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { tripFormOptions } from "@/lib/requests/mileage";
import { saveTrip } from "../actions";
import { TripForm } from "../trip-form";

export const metadata: Metadata = { title: "Log a trip" };

export default async function NewTripPage({ searchParams }: PageProps<"/trips/new">) {
  const viewer = await requireRole("employee");
  const { saved } = await searchParams;
  const options = await tripFormOptions(viewer);
  const office = options.places.find((p) => p.shared && p.label === "Main office");

  return (
    <Container className="max-w-3xl py-8">
      <PageHeader eyebrow="Mileage" title="Log a trip" description="Add it now while it's fresh. You'll submit your trips for approval later." />
      {saved ? (
        <Notice tone="success" className="mb-6">
          Trip saved. Add the next one below.
        </Notice>
      ) : null}
      <TripForm
        key={String(saved ?? "new")}
        options={options}
        action={saveTrip.bind(null, null, null)}
        submitLabel="Save trip"
        cancelHref="/trips"
        allowAnother
        initial={{
          date: options.today,
          from: { place: office?.id ?? "", address: "" },
          stops: [],
          to: { place: "", address: "" },
          roundTrip: false,
          miles: null,
          overrideReason: "",
          purpose: "",
          programId: viewer.defaultProgramId ?? "",
          notes: "",
        }}
      />
    </Container>
  );
}
