"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="no-print shrink-0 whitespace-nowrap">
      <Printer aria-hidden className="size-4" /> {label}
    </Button>
  );
}
