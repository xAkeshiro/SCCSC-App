import type { SelectHTMLAttributes } from "react";
import { siteLabel, type SiteGroup } from "@/lib/sites";

/**
 * "School or site": a plain select (it opens the phone's own picker), with schools grouped by
 * district so the long list stays easy to scan.
 */
export function SiteSelect({
  groups,
  placeholder = "Choose a school or site…",
  ...props
}: { groups: SiteGroup[]; placeholder?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="field" {...props}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.fundCode ?? "none"} label={g.fundName}>
          {g.sites.map((s) => (
            <option key={s.id} value={s.id}>
              {siteLabel(s)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
