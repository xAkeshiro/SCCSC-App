import { requireViewer } from "@/lib/auth/viewer";

/** Plain white pages for printing or saving as PDF. No navigation. */
export default async function PrintLayout({ children }: LayoutProps<"/print">) {
  await requireViewer();
  return <div className="min-h-dvh bg-white">{children}</div>;
}
