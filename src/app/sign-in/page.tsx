import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, MessageSquareText, Sparkles } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { BrushText, Button, Eyebrow, HeartIcon } from "@/components/ui";
import { isDemoData } from "@/db";
import { staff, staffRoles } from "@/db/schema";
import { DEMO } from "@/db/seed";
import { withSystem } from "@/db/with-user";
import { getSessionUserId, getPendingSignIn } from "@/lib/auth/session";
import { getViewer, type Role } from "@/lib/auth/viewer";
import { maskPhone } from "@/lib/phone";
import { signInAsDemoPerson, startOver } from "./actions";
import { RequestCodeForm, VerifyCodeForm } from "./forms";
import Image from "next/image";

export const metadata: Metadata = { title: "Sign in" };


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
      {/*
        Brand panel, echoing the dark hero on sccsc.org. Its contents are drawn at 90% and the
        sign-in column at 80% on desktop (Eden's preferred look). `zoom` goes on blocks with a
        natural height, never on the full-height panels, so the layout itself doesn't shrink.
      */}
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-11">
        <Image
          src="/brand/xin-glyph-white.svg"
          alt=""
          width={560}
          height={560}
          className="pointer-events-none absolute -right-24 -bottom-16 w-[34rem] opacity-[0.07] [zoom:0.9]"
        />
        <div className="relative flex items-center gap-3 [zoom:0.9]">
          <Image src="/brand/xin-mark-square.svg" alt="" width={44} height={44} />
          <Wordmark inverted />
        </div>
        <div className="relative max-w-md [zoom:0.9]">
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
        <p className="relative text-sm text-white/60 [zoom:0.9]">Sacramento Chinese Community Service Center</p>
      </aside>

      <main className="flex min-h-dvh flex-col justify-center bg-surface lg:min-h-0">
        <div className="mx-auto flex w-full max-w-[31rem] flex-col gap-3 px-4 py-4 sm:gap-4 sm:px-6 roomy:gap-5 roomy:py-8 lg:[zoom:0.8]">
          <div className="flex items-center gap-2.5 lg:hidden">
            <Image src="/brand/xin-mark-square.svg" alt="" width={40} height={40} className="size-8" />
            <Wordmark compact />
          </div>

          <div className="card p-6 shadow-[var(--shadow-card)] sm:px-9 sm:py-7 roomy:sm:px-10 roomy:sm:py-10">
            {pending ? (
              <>
                <Eyebrow>Check your phone</Eyebrow>
                <h2 className="mt-2 text-3xl leading-tight sm:mt-3 sm:text-4xl roomy:mt-4">Enter your code</h2>
                <p className="mt-2 text-ink-500 sm:mt-3 roomy:mt-4">
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
                <form action={startOver} className="mt-4 border-t border-ink-100 pt-4">
                  <Button type="submit" variant="ghost" size="sm" className="w-full text-ink-700">
                    <ArrowLeft aria-hidden className="size-4" /> Use a different name or number
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Eyebrow>Welcome to the Center</Eyebrow>
                <h2 className="mt-2 text-3xl leading-tight sm:mt-3 sm:text-4xl roomy:mt-4">
                  <BrushText>Sign in</BrushText>
                </h2>
                <p className="mt-2 text-ink-500 sm:mt-3 roomy:mt-4">No password. We&apos;ll text you a code.</p>
                <div className="mt-5 sm:mt-6 roomy:mt-8">
                  <RequestCodeForm />
                </div>
                <p className="mt-5 border-t border-ink-100 pt-4 text-sm text-ink-500 roomy:mt-7 roomy:pt-5">
                  <span className="font-semibold text-ink-700">New here?</span> Sign in the same way. An admin will approve
                  you within a day or two.
                </p>
              </>
            )}
          </div>

          {people.length > 0 && !pending ? <DemoPicker people={people} /> : null}
        </div>
      </main>
    </div>
  );
}

const GROUPS = [
  { role: "employee", label: "Employees" },
  { role: "coordinator", label: "Coordinators" },
  { role: "finance", label: "Finance" },
  { role: "admin", label: "Admins" },
] as const;

/** Demo only: pick a made-up person and skip the code. One compact row, so the page fits on screen. */
function DemoPicker({ people }: { people: { id: string; name: string; roles: Role[] }[] }) {
  return (
    <section aria-labelledby="demo-people" className="rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white/70 p-4 sm:px-5">
      <form action={signInAsDemoPerson}>
        <label id="demo-people" htmlFor="demo-person" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles aria-hidden className="size-4 text-brand-600" />
          Demo with fake data: sign in as
        </label>
        <div className="mt-2 flex gap-2">
          <select
            id="demo-person"
            name="staffId"
            className="field min-w-0 flex-1"
            aria-label="Demo person"
            // Start with the first person in the README walkthrough.
            defaultValue={people.some((p) => p.id === DEMO.rowan.staffId) ? DEMO.rowan.staffId : undefined}
          >
            {GROUPS.map((g) => {
              const inGroup = people.filter((p) => ROLE_ORDER[mainRole(p.roles)] === g.role);
              return inGroup.length ? (
                <optgroup key={g.role} label={g.label}>
                  {inGroup.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <Button type="submit" variant="dark" className="shrink-0">
            Explore <ArrowRight aria-hidden className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          Or try the real sign-in: <strong className="text-ink-700">Felix Hartwell</strong>, (916) 555-0108
        </p>
      </form>
    </section>
  );
}
