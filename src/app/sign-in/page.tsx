import type { Metadata } from "next";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { BrushText, Button, Eyebrow, HeartIcon, Notice } from "@/components/ui";
import { isDemoData } from "@/db";
import { staff, staffRoles } from "@/db/schema";
import { withSystem } from "@/db/with-user";
import { getSessionUserId, getPendingSignIn } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { maskPhone } from "@/lib/phone";
import { signInAsDemoPerson, startOver } from "./actions";
import { RequestCodeForm, VerifyCodeForm } from "./forms";
import Image from "next/image";

export const metadata: Metadata = { title: "Sign in" };

const ROLE_LABEL = { employee: "Employee", coordinator: "Coordinator", finance: "Finance", admin: "Admin" } as const;

const ROLE_ORDER = ["employee", "coordinator", "finance", "admin"] as const;
const mainRole = (roles: string[]) => Math.max(...roles.map((r) => ROLE_ORDER.indexOf(r as (typeof ROLE_ORDER)[number])));

async function demoPeople() {
  if (!isDemoData()) return [];
  return withSystem(async (tx) => {
    const people = await tx.select().from(staff).orderBy(staff.fullName);
    const roles = await tx.select().from(staffRoles);
    return people
      .filter((p) => p.userId && p.status === "active")
      .map((p) => ({
        id: p.id,
        name: p.fullName,
        roles: roles.filter((r) => r.staffId === p.id).map((r) => r.role),
      }))
      // Walk-through order: employees first, then coordinator, finance, admin.
      .sort((a, b) => mainRole(a.roles) - mainRole(b.roles) || a.name.localeCompare(b.name));
  });
}

export default async function SignInPage() {
  if (await getViewer()) redirect("/");
  if (await getSessionUserId()) redirect("/pending");

  const pending = await getPendingSignIn();
  const demoCode = pending ? (await cookies()).get("sccsc_demo_code")?.value : undefined;
  const people = await demoPeople();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel, echoing the dark hero on sccsc.org */}
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Image
          src="/brand/xin-glyph-white.svg"
          alt=""
          width={560}
          height={560}
          className="pointer-events-none absolute -right-24 -bottom-16 w-[34rem] opacity-[0.07]"
        />
        <div className="relative flex items-center gap-3">
          <Image src="/brand/xin-mark-square.svg" alt="" width={44} height={44} />
          <Wordmark inverted />
        </div>
        <div className="relative max-w-md">
          <p className="flex items-center gap-2 font-display text-sm font-medium text-white/90">
            <HeartIcon className="size-4 text-brand-600" /> For SCCSC staff
          </p>
          <h1 className="mt-4 text-5xl leading-[1.08] text-white">
            Log your trips. <span className="text-brand-200">Get reimbursed.</span>
          </h1>
          <p className="mt-5 text-lg text-white/80">
            Add a trip right after you drive, send your claim to your coordinator, and see when it&apos;s approved and
            paid. No more printing spreadsheets.
          </p>
        </div>
        <p className="relative text-sm text-white/60">Sacramento Chinese Community Service Center</p>
      </aside>

      <main className="flex flex-col bg-surface">
        {isDemoData() ? (
          <div className="bg-ink px-4 py-2 text-center text-sm text-white">
            <strong className="font-semibold">Demo</strong> · fake people and data only
          </div>
        ) : null}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Image src="/brand/xin-mark-square.svg" alt="" width={40} height={40} />
            <Wordmark compact />
          </div>

          <div className="card p-6 sm:p-8">
            {pending ? (
              <>
                <Eyebrow>Check your phone</Eyebrow>
                <h2 className="mt-2 text-3xl">Enter your code</h2>
                <p className="mt-2 text-ink-500">
                  We texted a code to <strong className="text-ink">{maskPhone(pending.phone)}</strong>. It works for 10 minutes.
                </p>
                {demoCode ? (
                  <div className="mt-5 flex gap-3 rounded-[var(--radius-card)] bg-ink-50 p-4" role="status">
                    <MessageSquareText aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" />
                    <p className="text-sm">
                      <span className="font-semibold">Demo text message</span> (no real text is sent)
                      <br />
                      Your SCCSC sign-in code is{" "}
                      <strong className="font-display text-lg tracking-widest" data-testid="demo-code">
                        {demoCode}
                      </strong>
                    </p>
                  </div>
                ) : null}
                <div className="mt-6">
                  <VerifyCodeForm />
                </div>
                <form action={startOver} className="mt-2 border-t border-ink-100 pt-4">
                  <Button type="submit" variant="ghost" size="sm" className="w-full text-ink-700">
                    <ArrowLeft aria-hidden className="size-4" /> Use a different name or number
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Eyebrow>Welcome to the Center</Eyebrow>
                <h2 className="mt-2 text-3xl">
                  <BrushText>Sign in</BrushText>
                </h2>
                <p className="mt-2 mb-6 text-ink-500">No password needed. We&apos;ll text you a code.</p>
                <RequestCodeForm />
                <p className="mt-5 text-sm text-ink-500">
                  New here? Sign in the same way. If we can&apos;t match you to the staff list, an admin will check and
                  approve your account, usually within a day or two.
                </p>
              </>
            )}
          </div>

          {people.length > 0 ? (
            <section aria-labelledby="demo-people" className="mt-8">
              <h2 id="demo-people" className="text-lg">
                Exploring the demo?
              </h2>
              <p className="mt-1 text-sm text-ink-500">Skip the code and sign in as one of these made-up people:</p>
              <ul className="mt-3 grid gap-2">
                {people.map((p) => (
                  <li key={p.id}>
                    <form action={signInAsDemoPerson}>
                      <input type="hidden" name="staffId" value={p.id} />
                      <button
                        type="submit"
                        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-btn)] border border-line bg-white px-4 py-2 text-left hover:border-brand-600 hover:bg-brand-50"
                      >
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-right text-sm text-ink-500">
                          {p.roles.map((r) => ROLE_LABEL[r]).join(" · ")}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <Notice className="mt-4" title="Try the real sign-in too">
                <strong>Felix Hartwell</strong>, (916) 555-0108 is on the staff list but hasn&apos;t signed in yet. Any other
                name and number goes to the admin&apos;s approval queue.
              </Notice>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
