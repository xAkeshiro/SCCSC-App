import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, Container, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { RosterImport } from "./roster-import";

export const metadata: Metadata = { title: "Import a staff list" };

export default async function ImportStaffPage() {
  await requireRole("admin");
  return (
    <Container className="max-w-4xl py-8">
      <Link href="/admin/staff" className="mb-4 inline-flex min-h-10 items-center gap-1.5 font-display font-medium text-brand-600 hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Staff
      </Link>
      <PageHeader
        eyebrow="Admin"
        title="Import a staff list"
        description="Add everyone at once from a Paychex export or any spreadsheet. You'll see what will change before anything is saved."
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <RosterImport />
        <aside>
          <Card className="space-y-3 p-5 text-sm text-ink-700">
            <h2 className="text-lg">What the file needs</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>A heading row, then one person per row. CSV or Excel.</li>
              <li>
                <strong>Name</strong>: “Full name”, or “First name” and “Last name”.
              </li>
              <li>
                <strong>Email</strong> and/or <strong>Mobile phone</strong>. A work email is used first.
              </li>
            </ul>
            <h2 className="pt-2 text-lg">What it does</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>New people are added as employees. Set reviewers and other roles on their records afterwards.</li>
              <li>For people already on the list, it only fills in a missing email or mobile number. Names are kept as they are.</li>
              <li>Nobody is removed. People who aren&apos;t in the file are listed so you can check them.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </Container>
  );
}
