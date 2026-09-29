import { ChevronRight, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { myClaims, type ClaimListItem } from "@/lib/data/claims";
import { formatDate, formatDay, plural } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { claimNumber } from "@/lib/requests/status";

export const metadata: Metadata = { title: "Claims" };

export default async function ClaimsPage() {
  const viewer = await requireRole("employee");
  const claims = await myClaims(viewer);
  const groups = [
    { title: "Needs you", list: claims.filter((c) => c.status === "returned" || c.status === "draft") },
    { title: "In progress", list: claims.filter((c) => ["submitted", "approved", "batched"].includes(c.status)) },
    { title: "Finished", list: claims.filter((c) => c.status === "paid" || c.status === "denied") },
  ].filter((g) => g.list.length > 0);

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Mileage"
        title="Claims"
        description="Each claim is a group of trips you sent together. Open one to see every step."
        actions={
          <ButtonLink href="/claims/new">
            <Send aria-hidden className="size-4" /> Submit trips
          </ButtonLink>
        }
      />
      {claims.length === 0 ? (
        <EmptyState title="No claims yet" action={<ButtonLink href="/trips/new">Log a trip</ButtonLink>}>
          Log your trips, then submit them. Your claims will show up here.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h2 className="text-2xl">{g.title}</h2>
              <ul className="mt-3 grid gap-3">
                {g.list.map((c) => (
                  <li key={c.id}>
                    <ClaimRow claim={c} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}

function ClaimRow({ claim: c }: { claim: ClaimListItem }) {
  const span =
    c.firstDate && c.lastDate
      ? c.firstDate === c.lastDate
        ? formatDay(c.firstDate, { weekday: false })
        : `${formatDay(c.firstDate, { weekday: false })} to ${formatDay(c.lastDate, { weekday: false })}`
      : "No trips";
  return (
    <Link href={`/claims/${c.id}`} className="card flex items-center gap-4 p-5 hover:shadow-[var(--shadow-card)]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-semibold">Claim {claimNumber(c.ref)}</span>
          <StatusBadge status={c.status} />
        </div>
        <p className="mt-1 text-ink-500">
          {plural(c.tripCount, "trip")} · {span}
          {c.submittedAt ? ` · sent ${formatDate(c.submittedAt)}` : ""}
        </p>
      </div>
      <p className="font-display text-xl font-semibold">{formatCents(c.totalCents)}</p>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-500" />
    </Link>
  );
}
