import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { BottomNav, HeaderNav } from "@/components/nav-links";
import { ButtonLink, Container, HeartIcon } from "@/components/ui";
import { isDemoData } from "@/db";
import { hasRole, requireViewer } from "@/lib/auth/viewer";
import { navBadges } from "@/lib/data/badges";
import { navFor } from "@/lib/nav";
import { signOut } from "../sign-in/actions";

const ROLE_LABEL = { employee: "Employee", coordinator: "Coordinator", finance: "Finance", admin: "Admin" } as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const items = navFor(viewer);
  const badges = await navBadges(viewer);
  const canLogTrips = hasRole(viewer, "employee");
  const roleText = viewer.roles
    .filter((r) => r !== "employee" || viewer.roles.length === 1)
    .map((r) => ROLE_LABEL[r])
    .join(", ");

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-[var(--radius-btn)] bg-white px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {/* Top bar: dark, like the contact bar on sccsc.org */}
      <div className="no-print bg-ink text-sm text-white/85">
        <Container className="flex min-h-9 items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2">
            <HeartIcon className="size-3.5 shrink-0 text-brand-600" />
            <span className="truncate">
              <span className="hidden sm:inline">SCCSC staff · </span>
              {isDemoData() ? <strong className="font-semibold text-white">Demo, fake data only</strong> : "Staff tools"}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden sm:inline" data-testid="signed-in-as">
              {viewer.fullName}
              {roleText ? <span className="text-white/60"> · {roleText}</span> : null}
            </span>
            <form action={signOut}>
              <button type="submit" className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-white hover:text-brand-200">
                <LogOut aria-hidden className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </Container>
      </div>

      <header className="no-print sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
        <Container className="flex min-h-16 items-center justify-between gap-4 py-2 md:min-h-20">
          <Logo />
          <HeaderNav items={items} badges={badges} />
          <div className="hidden lg:block">
            {canLogTrips ? (
              <ButtonLink href="/trips/new">
                <Plus aria-hidden className="size-5" /> Log a trip
              </ButtonLink>
            ) : null}
          </div>
        </Container>
      </header>

      <main id="main" className="flex-1 pb-28 lg:pb-12">
        {children}
      </main>

      <footer className="no-print hidden bg-ink text-white/75 md:block">
        <Container className="flex flex-wrap items-center justify-between gap-4 py-8 text-sm">
          <div>
            <p className="font-serif text-lg text-white">
              the<span className="text-2xl text-brand-500">center</span>
            </p>
            <p className="mt-1">Sacramento Chinese Community Service Center · Staff tools, internal use only</p>
          </div>
          <p>
            Questions about a claim? Ask your coordinator. Trouble signing in?{" "}
            <Link href="/help" className="font-semibold text-white underline underline-offset-4 hover:text-brand-200">
              Get help
            </Link>
          </p>
        </Container>
      </footer>

      <BottomNav items={items} badges={badges} canLogTrips={canLogTrips} />
    </>
  );
}
