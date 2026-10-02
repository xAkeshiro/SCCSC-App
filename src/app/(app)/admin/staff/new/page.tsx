import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/viewer";
import { staffEditor } from "@/lib/data/staff";
import { StaffForm } from "../staff-form";

export const metadata: Metadata = { title: "Add a person" };

export default async function NewStaffPage() {
  const viewer = await requireRole("admin");
  const data = await staffEditor(viewer, null);
  if (!data) notFound();
  return (
    <Container className="max-w-3xl py-8">
      <Link href="/admin/staff" className="mb-4 inline-flex min-h-10 items-center gap-1.5 font-display font-medium text-brand-600 hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Staff
      </Link>
      <PageHeader
        eyebrow="Admin"
        title="Add a person"
        description="Once they're on the list, they can sign in with their name and email (or mobile number) right away, without waiting for approval."
      />
      <StaffForm person={null} coordinators={data.coordinators} siteGroups={data.siteGroups} phoneText="" />
    </Container>
  );
}
