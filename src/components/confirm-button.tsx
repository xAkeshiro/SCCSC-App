"use client";

import type { ComponentProps } from "react";
import { Button } from "./ui";

/** A submit button that asks "Are you sure?" first. */
export function ConfirmButton({ confirm, onClick, ...props }: ComponentProps<typeof Button> & { confirm: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
        onClick?.(e);
      }}
    />
  );
}
