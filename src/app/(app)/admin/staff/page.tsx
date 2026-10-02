import { Search, Upload, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, ButtonLink, Chip, Container, EmptyState, Notice, PageHeader, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { staffDirectory, type StaffShow } from "@/lib/data/staff";
import { plural } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ROLE_LABEL } from "@/lib/roles";
import { AdminTabs } from "../admin-tabs";

export const metadata: Metadata = { title: "Staff" };

const SHOW: { value: StaffShow; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "Everyone" },
];

export default async function StaffPage({ searchParams }: PageProps<"/admin/staff">) {
  const viewer = await requireRole("admin");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const show = SHOW.find((s) => s.value === sp.show)?.value ?? "active";
  const { people, counts } = await staffDirectory(viewer, { q, show });
  const imported = typeof sp.imported === "string" ? /^(\d+)-(\d+)$/.exec(sp.imported) : null;

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Admin"
        title="Staff"
        description="Everyone who can sign in, what they do in the app, and who reviews their claims."
        actions={
          <>
            <ButtonLink href="/admin/staff/import" variant="secondary">
              <Upload aria-hidden className="size-4" /> Import a list
            </ButtonLink>
            <ButtonLink href="/admin/staff/new">
              <UserPlus aria-hidden className="size-4" /> Add a person
            </ButtonLink>
          </>
        }
      />
      <AdminTabs />
      {imported ? (
        <Notice tone="success" className="mb-6" title="Staff list imported">
          {plural(Number(imported[1]), "person", "people")} added, {plural(Number(imported[2]), "record")} updated. New people are employees reviewed by an
          admin until you choose their reviewer.
        </Notice>
      ) : null}

      <div className="mb-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat value={counts.active} label="Active staff" hint={counts.notSignedIn ? `${counts.notSignedIn} haven't signed in yet` : undefined} />
        <Stat value={counts.coordinator} label="Coordinators" />
        <Stat value={counts.finance} label="Finance" />
        <Stat value={counts.admin} label="Admins" />
      </div>

      <form role="search" className="mb-6 flex flex-wrap items-end gap-3" action="/admin/staff">
        <div className="min-w-0 flex-1 basis-60">
          <label htmlFor="q" className="field-label">
            Find someone
          </label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Name, email or phone" className="field" />
        </div>
        <div>
          <label htmlFor="show" className="field-label">
            Show
          </label>
          <select id="show" name="show" defaultValue={show} className="field">
            {SHOW.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
                {s.value === "inactive" ? ` (${counts.inactive})` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          <Search aria-hidden className="size-4" /> Search
        </Button>
      </form>

      {people.length === 0 ? (
        <EmptyState
          title={q ? "Nobody matches that" : show === "inactive" ? "Nobody is inactive" : "No staff yet"}
          action={
            q ? (
              <ButtonLink href={`/admin/staff?show=${show}`} variant="secondary">
                Clear the search
              </ButtonLink>
            ) : (
              <ButtonLink href="/admin/staff/new">Add a person</ButtonLink>
            )
          }
        >
          {q ? "Try part of their name, their email, or the last four digits of their phone." : "Add people one at a time, or import the list from Paychex."}
        </EmptyState>
      ) : (
        <section aria-label={`Staff (${plural(people.length, "person", "people")})`}>
          <p className="mb-2 text-sm text-ink-500">{plural(people.length, "person", "people")}</p>
          <ul className="card divide-y divide-ink-100">
            {people.map((p) => (
              <li key={p.id} className={p.status === "inactive" ? "bg-ink-50" : undefined}>
                <Link href={`/admin/staff/${p.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-display text-lg font-semibold text-ink">{p.fullName}</span>
                      {p.status === "inactive" ? <Chip className="bg-ink-100!">Inactive</Chip> : null}
                      {p.status === "active" && !p.signedIn ? <Chip className="bg-status-submitted-bg text-status-submitted">Not signed in yet</Chip> : null}
                    </span>
                    <span className="mt-0.5 block text-sm break-all text-ink-500">
                      {[p.email, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(" · ") || "No email or phone"}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-700">
                      {p.coordinatorName ? `Reviewed by ${p.coordinatorName}` : "Reviewed by an admin"}
                      {p.siteName ? ` · ${p.siteName}` : ""}
                      {p.teamSize ? ` · reviews ${plural(p.teamSize, "person", "people")}` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5 sm:justify-end">
                    {p.roles.map((r) => (
                      <Chip key={r} className={r === "employee" ? undefined : "bg-brand-50! text-brand-700!"}>
                        {ROLE_LABEL[r]}
                      </Chip>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
