import type { Viewer } from "@/lib/auth/viewer";
import { hasRole } from "@/lib/auth/viewer";

export type NavItem = { href: string; label: string; icon: "home" | "trips" | "claims" | "review" | "finance" | "admin" | "more" };

/** Main sections, depending on the person's roles. */
export function navFor(viewer: Viewer): NavItem[] {
  const items: NavItem[] = [{ href: "/", label: "Home", icon: "home" }];
  if (hasRole(viewer, "employee")) {
    items.push({ href: "/trips", label: "Trips", icon: "trips" }, { href: "/claims", label: "Claims", icon: "claims" });
  }
  if (hasRole(viewer, "coordinator", "admin")) items.push({ href: "/review", label: "Review", icon: "review" });
  if (hasRole(viewer, "finance", "admin")) items.push({ href: "/finance", label: "Finance", icon: "finance" });
  if (hasRole(viewer, "admin")) items.push({ href: "/admin", label: "Admin", icon: "admin" });
  return items;
}
