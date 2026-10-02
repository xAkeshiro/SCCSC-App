"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/admin", label: "Access requests" },
  { href: "/admin/budget-codes", label: "Budget codes" },
];

/** The admin sections. Scrolls sideways on a phone instead of wrapping. */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="-mx-4 mb-8 overflow-x-auto border-b border-ink-100 px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 font-display font-medium transition-colors",
                  active ? "border-brand-600 text-brand-600" : "border-transparent text-ink-700 hover:text-brand-600",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
