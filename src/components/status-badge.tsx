import { STATUS_LABEL, type RequestStatus } from "@/lib/requests/status";
import { cx } from "./ui";

const styles: Record<RequestStatus, string> = {
  draft: "bg-status-draft-bg text-status-draft",
  submitted: "bg-status-submitted-bg text-status-submitted",
  returned: "bg-status-returned-bg text-status-returned",
  approved: "bg-status-approved-bg text-status-approved",
  denied: "bg-status-denied-bg text-status-denied",
  batched: "bg-status-batched-bg text-status-batched",
  paid: "bg-status-paid-bg text-status-paid",
};

const dots: Record<RequestStatus, string> = {
  draft: "bg-status-draft",
  submitted: "bg-status-submitted",
  returned: "bg-status-returned",
  approved: "bg-status-approved",
  denied: "bg-status-denied",
  batched: "bg-status-batched",
  paid: "bg-white",
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        styles[status],
        className,
      )}
    >
      <span aria-hidden className={cx("size-1.5 rounded-full", dots[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
