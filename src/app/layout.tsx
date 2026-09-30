import type { Metadata, Viewport } from "next";
import { EB_Garamond, Instrument_Sans, Onest } from "next/font/google";
import { Intro } from "@/components/intro/intro";
import { INTRO_SCRIPT } from "@/components/intro/script";
import "./globals.css";

const display = Onest({ variable: "--font-onest", subsets: ["latin"] });
const sans = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const serif = EB_Garamond({ variable: "--font-garamond", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: {
    default: "Reimbursement tracker | SCCSC staff",
    template: "%s | Reimbursement tracker",
  },
  description:
    "Log business trips, claim your phone bill, and track reimbursement. For Sacramento Chinese Community Service Center staff.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#d0112b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The intro script may mark <html> before React starts, hence suppressHydrationWarning.
    <html lang="en" className={`${display.variable} ${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <Intro />
        {children}
      </body>
    </html>
  );
}
