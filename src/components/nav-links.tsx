"use client";

import { Banknote, CarFront, FileText, Home, ListChecks, Menu, Plus, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";
import { cx } from "./ui";

const ICONS = {
  home: Home,
  trips: CarFront,
  claims: FileText,
  phone: Smartphone,
  review: ListChecks,
  finance: Banknote,
  admin: ShieldCheck,
  more: Menu,
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop header links. The current section is red, as on sccsc.org. */
export function HeaderNav({ items, badges }: { items: NavItem[]; badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative rounded-[var(--radius-btn)] px-3 py-2 font-display text-[0.98rem] transition-colors lg:px-3.5",
              active ? "text-brand-600" : "text-ink hover:text-brand-600",
            )}
          >
            {item.label}
            {badges[item.href] ? <Badge count={badges[item.href]} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cx(
        "ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white",
        className,
      )}
    >
      {count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

/**
 * Phone and tablet tab bar: Home, Trips, a big "Log trip" button, Claims, and More (phone bill and the other
 * role areas).
 * People who don't log trips get their role areas directly.
 */
export function BottomNav({ items, badges, canLogTrips }: { items: NavItem[]; badges: Record<string, number>; canLogTrips: boolean }) {
  const pathname = usePathname();
  const main = items.filter((i) => ["/", "/trips", "/claims"].includes(i.href));
  const extra = items.filter((i) => !["/", "/trips", "/claims"].includes(i.href));
  const extraBadge = extra.reduce((n, i) => n + (badges[i.href] ?? 0), 0);
  const tabs = canLogTrips ? main : [...main, ...extra].slice(0, 4);
  const showMore = canLogTrips || extra.length > 3;

  const tab = (item: NavItem, badge?: number) => {
    const Icon = ICONS[item.icon];
    // The Log trip button has its own highlight.
    const active = isActive(pathname, item.href) && pathname !== "/trips/new";
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.72rem] font-semibold", active ? "text-brand-600" : "text-ink-500")}
      >
        <span className="relative">
          <Icon aria-hidden className="size-6" strokeWidth={active ? 2.4 : 2} />
          {badge ? <Badge count={badge} className="absolute -top-1.5 -right-3.5 ml-0" /> : null}
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {tabs.slice(0, 2).map((i) => tab(i, badges[i.href]))}
        {canLogTrips ? (
          <Link
            href="/trips/new"
            className="flex flex-1 flex-col items-center gap-0.5 pb-2 text-[0.72rem] font-semibold text-ink"
            aria-current={pathname === "/trips/new" ? "page" : undefined}
          >
            <span className="-mt-4 grid size-12 place-items-center rounded-full bg-brand-600 text-white shadow-[var(--shadow-card)] ring-4 ring-white">
              <Plus aria-hidden className="size-7" strokeWidth={2.5} />
            </span>
            Log trip
          </Link>
        ) : null}
        {tabs.slice(2).map((i) => tab(i, badges[i.href]))}
        {showMore ? tab({ href: "/more", label: "More", icon: "more" }, extraBadge) : null}
      </div>
    </nav>
  );
}
