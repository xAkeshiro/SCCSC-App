import type { Metadata, Viewport } from "next";
import { EB_Garamond, Instrument_Sans, Onest } from "next/font/google";
import "./globals.css";

const display = Onest({ variable: "--font-onest", subsets: ["latin"] });
const sans = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const serif = EB_Garamond({ variable: "--font-garamond", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: {
    default: "Mileage tracker | SCCSC staff",
    template: "%s | Mileage tracker",
  },
  description: "Log business trips, submit mileage claims and track reimbursement. For Sacramento Chinese Community Service Center staff.",
  icons: { icon: "/brand/xin-mark-rounded.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#d0112b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${serif.variable}`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
