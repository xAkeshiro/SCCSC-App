/** A school or site staff can pick (an Aplos "Schools" tag). */
export type SiteOption = { id: string; code: string; name: string };
/** Sites in one fund (school district, or the Center). */
export type SiteGroup = { fundCode: string | null; fundName: string; sites: SiteOption[] };

/** How a school or site reads in lists: "FOOTHILL HIGH SCHOOL (211)". */
export function siteLabel(site: { code: string; name: string } | null | undefined) {
  return site ? `${site.name} (${site.code})` : "";
}
