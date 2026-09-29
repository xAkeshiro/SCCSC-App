import "server-only";

import { sql } from "drizzle-orm";
import { rows, withUser } from "@/db/with-user";
import { hasRole, type Viewer } from "@/lib/auth/viewer";

/** Counts shown on the nav: things waiting for this person. */
export async function navBadges(viewer: Viewer): Promise<Record<string, number>> {
  return withUser(viewer.userId, async (tx) => {
    const [r] = await rows<{ returned: number; review: number; finance: number; access: number }>(
      tx,
      sql`select
        (select count(*)::int from public.requests where owner_id = ${viewer.staffId}::uuid and status in ('returned', 'draft')) as returned,
        ${hasRole(viewer, "coordinator", "admin") ? sql`(select count(*)::int from public.requests r where r.status = 'submitted' and app.can_review(r.owner_id))` : sql`0`} as review,
        ${hasRole(viewer, "finance", "admin") ? sql`(select count(*)::int from public.requests where status = 'approved')` : sql`0`} as finance,
        ${hasRole(viewer, "admin") ? sql`(select count(*)::int from public.access_requests where status = 'pending')` : sql`0`} as access`,
    );
    return { "/claims": r.returned, "/review": r.review, "/finance": r.finance, "/admin": r.access };
  });
}
