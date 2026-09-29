import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { reviewQueue, type QueueClaim } from "@/lib/data/review";
import { plural, timeAgo } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { claimNumber } from "@/lib/requests/status";
import { QueueList, type QueueItem } from "./queue-list";

export const metadata: Metadata = { title: "Review" };

const DONE: Record<string, string> = {
  approved: "Claim approved. It's on its way to finance.",
  returned: "Claim returned with your comment.",
  denied: "Claim denied.",
};

const ICON = {
  approved: <CheckCircle2 aria-hidden className="size-4 text-status-approved" />,
  returned: <RotateCcw aria-hidden className="size-4 text-status-returned" />,
  denied: <XCircle aria-hidden className="size-4 text-status-denied" />,
} as Record<string, React.ReactNode>;

const toItem = (c: QueueClaim): QueueItem => ({ ...c, submittedAt: c.submittedAt.toISOString() });

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const viewer = await requireRole("coordinator", "admin");
  const { done, count } = await searchParams;
  const { claims, recent, bulkApproveMaxCents } = await reviewQueue(viewer);
  const mine = claims.filter((c) => c.mine);
  const others = claims.filter((c) => !c.mine);
  const bulkText = formatCents(bulkApproveMaxCents).replace(".00", "");

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Review"
        title="Claims to review"
        description="Open a claim to check its trips, then approve it, return it with a comment, or deny it. Oldest first."
      />
      {done === "bulk" ? (
        <Notice tone="success" className="mb-6">
          {plural(Number(count) || 0, "claim")} approved. They&apos;re on their way to finance.
        </Notice>
      ) : typeof done === "string" && DONE[done] ? (
        <Notice tone="success" className="mb-6">
          {DONE[done]}
        </Notice>
      ) : null}

      {claims.length === 0 ? (
        <EmptyState title="You're all caught up">When your team submits a claim, it will show up here.</EmptyState>
      ) : (
        <div className="space-y-10">
          {mine.length > 0 ? (
            <section aria-labelledby="team">
              <h2 id="team" className="mb-3 text-2xl">
                Your team <span className="text-brand-600">({mine.length})</span>
              </h2>
              <QueueList items={mine.map(toItem)} bulkLimitText={bulkText} />
            </section>
          ) : null}
          {others.length > 0 ? (
            <section aria-labelledby="others">
              <h2 id="others" className="text-2xl">
                Other claims you can review <span className="text-brand-600">({others.length})</span>
              </h2>
              <p className="mt-1 mb-3 text-ink-500">
                As an admin you can review anyone&apos;s claim, for example when someone has no coordinator or theirs is away.
              </p>
              <QueueList items={others.map(toItem)} bulkLimitText={bulkText} />
            </section>
          ) : null}
        </div>
      )}

      {recent.length > 0 ? (
        <section aria-labelledby="recent" className="mt-12">
          <h2 id="recent" className="text-2xl">
            Your recent decisions
          </h2>
          <ul className="card mt-3 divide-y divide-ink-100">
            {recent.map((e) => (
              <li key={e.id}>
                <Link href={`/claims/${e.requestId}`} className="flex items-start gap-3 px-5 py-3 hover:bg-surface">
                  <span className="mt-1">{ICON[e.action]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{e.ownerName}</span>, claim {claimNumber(e.ref)} ({formatCents(e.totalCents)}):{" "}
                    {e.action} {timeAgo(e.createdAt)}
                    {e.comment ? <span className="block text-ink-500">“{e.comment}”</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}
