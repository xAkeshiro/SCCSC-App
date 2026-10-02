import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Chip, Container, Eyebrow, Notice } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { staffEditor } from "@/lib/data/staff";
import { formatDateTime, formatDay, plural } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ROLE_LABEL } from "@/lib/roles";
import { MoveTeamForm, StaffForm } from "../staff-form";

export const metadata: Metadata = { title: "Staff member" };

const DONE: Record<string, string> = {
  added: "Added to the staff list. They can sign in now.",
  saved: "Changes saved.",
  unchanged: "Nothing had changed.",
  moved: "Team moved.",
};

const SOURCE: Record<string, string> = { roster: "Added by an admin", request: "Approved from an access request", seed: "Demo person" };

export default async function StaffMemberPage({ params, searchParams }: PageProps<"/admin/staff/[id]">) {
  const viewer = await requireRole("admin");
  const { id } = await params;
  const { done } = await searchParams;
  const data = await staffEditor(viewer, id);
  if (!data?.person) notFound();
  const p = data.person;

  return (
    <Container className="py-8">
      <Link href="/admin/staff" className="mb-4 inline-flex min-h-10 items-center gap-1.5 font-display font-medium text-brand-600 hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Staff
      </Link>
      <div className="pb-6">
        <Eyebrow>Staff member</Eyebrow>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-[1.75rem] sm:text-4xl">
          {p.fullName}
          {p.status === "inactive" ? <Chip className="bg-ink-100! text-sm">Inactive</Chip> : null}
        </h1>
        <p className="mt-2 flex flex-wrap gap-1.5">
          {p.roles.map((r) => (
            <Chip key={r} className={r === "employee" ? undefined : "bg-brand-50! text-brand-700!"}>
              {ROLE_LABEL[r]}
            </Chip>
          ))}
        </p>
      </div>
      {typeof done === "string" && DONE[done] ? (
        <Notice tone="success" className="mb-6">
          {DONE[done]}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StaffForm
          key={`${p.id}-${typeof done === "string" ? done : ""}`}
          person={{
            id: p.id,
            fullName: p.fullName,
            email: p.email,
            phone: p.phone,
            roles: p.roles,
            coordinatorId: p.coordinatorId,
            defaultSiteId: p.defaultSiteId,
            aplosName: p.aplosName,
            active: p.status === "active",
            signedIn: p.userId !== null,
          }}
          coordinators={data.coordinators}
          siteGroups={data.siteGroups}
          phoneText={p.phone ? formatPhone(p.phone) : ""}
        />

        <aside className="space-y-6">
          <Card className="space-y-3 p-5">
            <h2 className="text-lg">Their team</h2>
            {data.team.length ? (
              <>
                <p className="text-ink-700">
                  {p.fullName.split(" ")[0]} reviews {plural(data.team.length, "person", "people")}:
                </p>
                <ul className="space-y-1">
                  {data.team.map((m) => (
                    <li key={m.id}>
                      <Link href={`/admin/staff/${m.id}`} className="text-brand-600 hover:underline">
                        {m.fullName}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-ink-500">Before they stop being a coordinator or leave, move their team to someone else.</p>
                <MoveTeamForm fromId={p.id} coordinators={data.coordinators} />
              </>
            ) : (
              <p className="text-ink-500">
                {p.roles.includes("coordinator")
                  ? "Nobody yet. To give them a team, choose them as the reviewer on each person's record."
                  : "Not a coordinator, so they don't review anyone's claims."}
              </p>
            )}
          </Card>
          <Card className="space-y-2 p-5">
            <h2 className="text-lg">Signing in</h2>
            <p className="text-ink-700">{p.userId ? "Has signed in." : "Hasn't signed in yet."}</p>
            <p className="text-sm text-ink-500">
              {SOURCE[p.source] ?? "Added"} on {formatDay(p.createdAt.toISOString().slice(0, 10), { withYear: true, weekday: false })}.
            </p>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg">Changes</h2>
            {data.history.length ? (
              <ol className="mt-3 space-y-3">
                {data.history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="text-ink-700">{h.summary}</p>
                    <p className="text-ink-500">
                      {h.actorName}, {formatDateTime(h.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-ink-500">No changes made in the app yet.</p>
            )}
          </Card>
        </aside>
      </div>
    </Container>
  );
}
