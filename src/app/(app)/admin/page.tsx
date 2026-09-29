import type { Metadata } from "next";
import { Chip, Container, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { adminOverview } from "@/lib/data/admin";
import { formatDate, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { AccessRequestCard } from "./request-card";

export const metadata: Metadata = { title: "Admin" };

const ROLE_LABEL = { employee: "Employee", coordinator: "Coordinator", finance: "Finance", admin: "Admin" } as const;

export default async function AdminPage() {
  const viewer = await requireRole("admin");
  const data = await adminOverview(viewer);

  return (
    <Container className="space-y-10 py-8">
      <PageHeader
        eyebrow="Admin"
        title="People and access"
        description="Approve new sign-ins, and see who is on the staff list. Roster import, role changes, rates and settings are coming next."
      />

      <section aria-labelledby="requests">
        <h2 id="requests" className="text-2xl">
          Waiting for access {data.pending.length ? <span className="text-brand-600">({data.pending.length})</span> : null}
        </h2>
        <p className="mt-1 text-ink-500">These people verified their phone but didn&apos;t match the staff list.</p>
        {data.pending.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No one is waiting">New requests show up here when someone signs in who isn&apos;t on the staff list.</EmptyState>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {data.pending.map((r) => (
              <AccessRequestCard
                key={r.id}
                request={{
                  id: r.id,
                  fullName: r.fullName,
                  phone: formatPhone(r.phoneE164),
                  askedAgo: timeAgo(r.createdAt),
                  matchedName: r.matched?.fullName ?? null,
                }}
                coordinators={data.coordinators.map((c) => ({ id: c.id, fullName: c.fullName }))}
                programs={data.programs.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
              />
            ))}
          </ul>
        )}
        {data.reviewed.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer font-display font-medium text-brand-600">Recently reviewed</summary>
            <ul className="mt-2 space-y-1 text-ink-700">
              {data.reviewed.map((r) => (
                <li key={r.id}>
                  {r.fullName}: {r.status === "approved" ? "approved" : "rejected"} by {r.reviewerName ?? "an admin"}
                  {r.reviewedAt ? ` on ${formatDate(r.reviewedAt)}` : ""}
                  {r.reviewNote ? <span className="text-ink-500"> (“{r.reviewNote}”)</span> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="staff">
        <h2 id="staff" className="text-2xl">
          Staff list
        </h2>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="border-b border-ink-100 text-sm text-ink-500">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                <th scope="col" className="px-5 py-3 font-semibold">Roles</th>
                <th scope="col" className="px-5 py-3 font-semibold">Coordinator</th>
                <th scope="col" className="px-5 py-3 font-semibold">Mobile</th>
                <th scope="col" className="px-5 py-3 font-semibold">Signed in?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.staff.map((p) => (
                <tr key={p.id} className={p.status === "inactive" ? "text-ink-500" : undefined}>
                  <td className="px-5 py-3 font-semibold">
                    {p.fullName}
                    {p.status === "inactive" ? <span className="ml-2 text-sm font-normal">(inactive)</span> : null}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.roles.map((r) => (
                        <Chip key={r}>{ROLE_LABEL[r]}</Chip>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3">{p.coordinatorName ?? <span className="text-ink-500">Admin reviews</span>}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{p.phone ? formatPhone(p.phone) : "—"}</td>
                  <td className="px-5 py-3">{p.userId ? "Yes" : <span className="text-ink-500">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Container>
  );
}
