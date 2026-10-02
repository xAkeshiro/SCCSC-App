import "server-only";

import { and, desc, eq, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { adminEvents } from "@/db/schema";
import { withUser } from "@/db/with-user";
import type { Viewer } from "@/lib/auth/viewer";

export type AdminArea = (typeof adminEvents.$inferSelect)["area"];

export const ADMIN_AREA_LABEL: Record<AdminArea, string> = {
  staff: "Staff",
  access: "Access requests",
  rates: "Rates",
  rules: "Rules",
  budget_codes: "Budget codes",
};

/** Records a change made in the admin tools. The database fills in who made it and when. */
export async function logAdmin(tx: Tx, area: AdminArea, summary: string, staffId: string | null = null) {
  await tx.execute(sql`select app.log_admin(${area}::public.admin_area, ${summary}, ${staffId}::uuid)`);
}

const PAGE = 50;

/** Admin changes, newest first, optionally for one area or person. `before` is an event id, for paging. */
export async function adminHistory(viewer: Viewer, f: { area?: AdminArea | null; staffId?: string | null; before?: number | null } = {}) {
  return withUser(viewer.userId, async (tx) => {
    const list = await tx
      .select()
      .from(adminEvents)
      .where(
        and(
          f.area ? eq(adminEvents.area, f.area) : undefined,
          f.staffId ? eq(adminEvents.staffId, f.staffId) : undefined,
          f.before ? lt(adminEvents.id, f.before) : undefined,
        ),
      )
      .orderBy(desc(adminEvents.id))
      .limit(PAGE + 1);
    return { events: list.slice(0, PAGE), more: list.length > PAGE ? list[PAGE - 1].id : null };
  });
}
