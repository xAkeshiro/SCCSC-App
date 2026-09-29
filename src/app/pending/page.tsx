import { desc, eq } from "drizzle-orm";
import { Clock3, ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { Button, Eyebrow } from "@/components/ui";
import { accessRequests } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { getSessionUserId } from "@/lib/auth/session";
import { getViewer } from "@/lib/auth/viewer";
import { firstName } from "@/lib/names";
import { signOut } from "../sign-in/actions";

export const metadata: Metadata = { title: "Waiting for approval" };

export default async function PendingPage() {
  if (await getViewer()) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/sign-in");

  const [request] = await withUser(userId, (tx) =>
    tx.select().from(accessRequests).where(eq(accessRequests.userId, userId)).orderBy(desc(accessRequests.createdAt)).limit(1),
  );
  const rejected = request?.status === "rejected";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-2.5">
        <Image src="/brand/xin-mark-square.svg" alt="" width={40} height={40} />
        <Wordmark compact />
      </div>
      <div className="card p-6 sm:p-8">
        {rejected ? (
          <>
            <ShieldX aria-hidden className="size-10 text-brand-600" />
            <h1 className="mt-4 text-3xl">We couldn&apos;t approve this account</h1>
            <p className="mt-3 text-ink-700">
              We weren&apos;t able to match {request.fullName} to our staff records.
              {request.reviewNote ? (
                <>
                  {" "}
                  The admin said: <q className="italic">{request.reviewNote}</q>
                </>
              ) : null}
            </p>
            <p className="mt-3 text-ink-700">If you think this is a mistake, please talk to the office.</p>
          </>
        ) : (
          <>
            <Eyebrow>Almost there</Eyebrow>
            <h1 className="mt-2 text-3xl">Thanks{request ? `, ${firstName(request.fullName)}` : ""}!</h1>
            <div className="mt-4 flex gap-3 rounded-[var(--radius-card)] bg-status-returned-bg p-4 text-status-returned">
              <Clock3 aria-hidden className="mt-0.5 size-5 shrink-0" />
              <p>
                <strong>Your account is waiting for approval.</strong> An admin will check your name and phone number against
                payroll, usually within one or two business days.
              </p>
            </div>
            <p className="mt-4 text-ink-700">
              Once you&apos;re approved, sign in the same way and you&apos;ll go straight in. You can close this page.
            </p>
          </>
        )}
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="secondary" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
