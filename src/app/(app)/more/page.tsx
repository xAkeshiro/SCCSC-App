import { ChevronRight, CircleHelp, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/viewer";
import { navFor } from "@/lib/nav";
import { signOut } from "../../sign-in/actions";

export const metadata: Metadata = { title: "More" };

/** Phone menu: every section, plus help and sign out. */
export default async function MorePage() {
  const viewer = await requireViewer();
  const items = navFor(viewer).filter((i) => i.href !== "/");
  const row = "flex min-h-14 items-center justify-between gap-3 px-5 py-3 font-display text-lg";
  return (
    <Container className="py-8">
      <PageHeader title="More" description={`Signed in as ${viewer.fullName}.`} />
      <ul className="card divide-y divide-ink-100">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className={`${row} hover:bg-surface`}>
              {i.label}
              <ChevronRight aria-hidden className="size-5 text-ink-500" />
            </Link>
          </li>
        ))}
        <li>
          <Link href="/help" className={`${row} hover:bg-surface`}>
            <span className="flex items-center gap-2">
              <CircleHelp aria-hidden className="size-5 text-ink-500" /> Help
            </span>
            <ChevronRight aria-hidden className="size-5 text-ink-500" />
          </Link>
        </li>
        <li>
          <form action={signOut}>
            <button type="submit" className={`${row} w-full text-brand-700 hover:bg-brand-50`}>
              <span className="flex items-center gap-2">
                <LogOut aria-hidden className="size-5" /> Sign out
              </span>
            </button>
          </form>
        </li>
      </ul>
    </Container>
  );
}
