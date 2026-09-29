import { cx } from "./ui";

const STYLE = {
  open: "bg-status-submitted-bg text-status-submitted",
  exported: "bg-status-batched-bg text-status-batched",
  paid: "bg-status-paid-bg text-status-paid",
} as const;
const LABEL = { open: "Open", exported: "Exported", paid: "Paid" } as const;

export function BatchStatusBadge({ status, className }: { status: "open" | "exported" | "paid"; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", STYLE[status], className)}>
      {LABEL[status]}
    </span>
  );
}
