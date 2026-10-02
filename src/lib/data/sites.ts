/**
 * Schools and sites (Aplos "Schools" tags) for the trip and phone bill forms, grouped by fund
 * (school district) so a long list stays easy to scan on a phone.
 */
import "server-only";

import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db";
import { funds, sites } from "@/db/schema";
import type { SiteGroup } from "@/lib/sites";

export type { SiteGroup, SiteOption } from "@/lib/sites";

/**
 * Sites staff can pick, grouped by fund in fund order (1, 100, 200 …) and by name within a fund.
 * `include` keeps a site that's since been hidden, so an older trip still shows its own.
 */
export async function siteGroups(tx: Tx, include?: string | null): Promise<SiteGroup[]> {
  const keep = include && z.string().uuid().safeParse(include).success ? include : null;
  const list = await tx
    .select({ id: sites.id, code: sites.code, name: sites.name, fundCode: sites.fundCode, fundName: funds.name })
    .from(sites)
    .leftJoin(funds, eq(funds.code, sites.fundCode))
    .where(keep ? or(eq(sites.active, true), eq(sites.id, keep)) : eq(sites.active, true));
  const groups = new Map<string, SiteGroup>();
  for (const s of list) {
    const key = s.fundCode ?? "";
    const group = groups.get(key) ?? { fundCode: s.fundCode, fundName: s.fundName ?? "Other", sites: [] };
    group.sites.push({ id: s.id, code: s.code, name: s.name });
    groups.set(key, group);
  }
  const fundOrder = (code: string | null) => (code === null ? Number.MAX_SAFE_INTEGER : Number(code) || 0);
  return [...groups.values()]
    .sort((a, b) => fundOrder(a.fundCode) - fundOrder(b.fundCode))
    .map((g) => ({ ...g, sites: g.sites.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code)) }));
}

/** An active site by id, or null. */
export async function findActiveSite(tx: Tx, id: string | null | undefined) {
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  const [site] = await tx.select({ id: sites.id }).from(sites).where(and(eq(sites.id, id), eq(sites.active, true))).limit(1);
  return site ?? null;
}
