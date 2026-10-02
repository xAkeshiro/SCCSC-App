import type { Metadata } from "next";
import Link from "next/link";
import { Button, ButtonLink, Card, Container, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { ADMIN_AREA_LABEL, adminHistory, type AdminArea } from "@/lib/data/admin-log";
import { claimHistory } from "@/lib/data/history";
import { formatDateTime } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { ACTION_LABEL, STATUS_LABEL, claimNumber, type RequestAction } from "@/lib/requests/status";
import { REQUEST_TYPES } from "@/lib/requests/types";
import { AdminTabs } from "../admin-tabs";

export const metadata: Metadata = { title: "History" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const isDate = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null);
const isUuid = (id: string | undefined) => (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null);
const page = (v: string | undefined) => (v && /^\d{1,12}$/.test(v) ? Number(v) : null);
const pageNumber = (v: string | undefined) => (v && /^\d{1,5}$/.test(v) ? Number(v) : 0);

export default async function HistoryPage({ searchParams }: PageProps<"/admin/history">) {
  const viewer = await requireRole("admin");
  const sp = await searchParams;
  const view = one(sp.view) === "admin" ? "admin" : "claims";

  return (
    <Container className="py-8">
      <PageHeader
        eyebrow="Admin"
        title="History"
        description="Every step on every claim, and every change made in the admin tools: who, what and when. Nothing here can be changed or deleted."
      />
      <AdminTabs />
      <nav aria-label="Which history" className="mb-6 inline-flex rounded-[var(--radius-btn)] border border-ink-100 bg-white p-1">
        {[
          { key: "claims", label: "Claims", href: "/admin/history" },
          { key: "admin", label: "Admin changes", href: "/admin/history?view=admin" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={view === t.key ? "page" : undefined}
            className={cx(
              "inline-flex min-h-10 items-center rounded-[calc(var(--radius-btn)-2px)] px-4 font-display font-medium",
              view === t.key ? "bg-ink text-white" : "text-ink-700 hover:text-brand-600",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {view === "admin" ? <AdminChanges sp={sp} viewer={viewer} /> : <ClaimSteps sp={sp} viewer={viewer} />}
    </Container>
  );
}

type Sp = Record<string, string | string[] | undefined>;
type ViewerArg = Awaited<ReturnType<typeof requireRole>>;

async function ClaimSteps({ sp, viewer }: { sp: Sp; viewer: ViewerArg }) {
  const action = (Object.keys(ACTION_LABEL) as RequestAction[]).find((a) => a === one(sp.action)) ?? null;
  const f = { person: isUuid(one(sp.person)), action, from: isDate(one(sp.from)), to: isDate(one(sp.to)), page: pageNumber(one(sp.page)) };
  const data = await claimHistory(viewer, f);
  const query = (extra: Record<string, string | number>) => {
    const q = new URLSearchParams();
    if (f.person) q.set("person", f.person);
    if (f.action) q.set("action", f.action);
    if (f.from) q.set("from", f.from);
    if (f.to) q.set("to", f.to);
    for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
    return `/admin/history?${q}`;
  };
  const filtered = f.person || f.action || f.from || f.to;

  return (
    <>
      <form role="search" action="/admin/history" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
        <div>
          <label htmlFor="person" className="field-label">
            Whose claims
          </label>
          <select id="person" name="person" defaultValue={f.person ?? ""} className="field">
            <option value="">Everyone</option>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="action" className="field-label">
            What happened
          </label>
          <select id="action" name="action" defaultValue={f.action ?? ""} className="field">
            <option value="">Anything</option>
            {(Object.keys(ACTION_LABEL) as RequestAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="field-label">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={f.from ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="to" className="field-label">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={f.to ?? ""} className="field" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            Show
          </Button>
          {filtered ? (
            <ButtonLink href="/admin/history" variant="ghost">
              Clear
            </ButtonLink>
          ) : null}
        </div>
      </form>

      {data.events.length === 0 ? (
        <EmptyState title="Nothing to show">{filtered ? "Nothing matches these filters." : "No claims have been sent yet."}</EmptyState>
      ) : (
        <Card>
          <ol className="divide-y divide-ink-100" aria-label="Claim history, newest first">
            {data.events.map((e) => (
              <li key={e.id} className="px-5 py-3.5">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{ACTION_LABEL[e.action]}</span>
                  <Link href={`/claims/${e.requestId}`} className="font-display font-medium text-brand-600 hover:underline">
                    {claimNumber(e.ref, e.type)}
                  </Link>
                  <span className="text-ink-500">
                    {e.ownerName} · {REQUEST_TYPES[e.type].label} · {formatCents(e.totalCents)}
                  </span>
                </p>
                <p className="text-sm text-ink-700">
                  by {e.actorName}, {formatDateTime(e.at)}
                  <span className="text-ink-500">
                    {" "}
                    · {e.fromStatus ? `${STATUS_LABEL[e.fromStatus]} → ` : ""}
                    {STATUS_LABEL[e.toStatus]}
                  </span>
                </p>
                {e.comment ? <p className="mt-1 text-ink-700">“{e.comment}”</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      )}
      {data.more || f.page > 0 ? (
        <div className="mt-4 flex gap-2">
          {f.page > 0 ? (
            <ButtonLink href={query({ page: f.page - 1 })} variant="secondary">
              Newer
            </ButtonLink>
          ) : null}
          {data.more ? (
            <ButtonLink href={query({ page: f.page + 1 })} variant="secondary">
              Older
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

async function AdminChanges({ sp, viewer }: { sp: Sp; viewer: ViewerArg }) {
  const area = (Object.keys(ADMIN_AREA_LABEL) as AdminArea[]).find((a) => a === one(sp.area)) ?? null;
  const data = await adminHistory(viewer, { area, before: page(one(sp.before)) });
  return (
    <>
      <form role="search" action="/admin/history" className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value="admin" />
        <div>
          <label htmlFor="area" className="field-label">
            Part of admin
          </label>
          <select id="area" name="area" defaultValue={area ?? ""} className="field">
            <option value="">Everything</option>
            {(Object.keys(ADMIN_AREA_LABEL) as AdminArea[]).map((a) => (
              <option key={a} value={a}>
                {ADMIN_AREA_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </form>
      {data.events.length === 0 ? (
        <EmptyState title="No changes yet">Changes to staff, access requests, budget codes, rates and rules show up here.</EmptyState>
      ) : (
        <Card>
          <ol className="divide-y divide-ink-100" aria-label="Admin changes, newest first">
            {data.events.map((e) => (
              <li key={e.id} className="px-5 py-3.5">
                <p className="text-ink">{e.summary}</p>
                <p className="text-sm text-ink-500">
                  {ADMIN_AREA_LABEL[e.area]} · {e.actorName}, {formatDateTime(e.createdAt)}
                  {e.staffId ? (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/admin/staff/${e.staffId}`} className="text-brand-600 hover:underline">
                        Open their record
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      )}
      {data.more ? (
        <div className="mt-4">
          <ButtonLink href={`/admin/history?view=admin${area ? `&area=${area}` : ""}&before=${data.more}`} variant="secondary">
            Older
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}
