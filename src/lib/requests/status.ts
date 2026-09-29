/** Plain-language names for request statuses and history actions. */

export type RequestStatus = "draft" | "submitted" | "returned" | "approved" | "denied" | "batched" | "paid";
export type RequestAction =
  | "submitted"
  | "withdrawn"
  | "resubmitted"
  | "approved"
  | "returned"
  | "denied"
  | "batched"
  | "unbatched"
  | "paid";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for approval",
  returned: "Returned for changes",
  approved: "Approved",
  denied: "Denied",
  batched: "Being paid",
  paid: "Paid",
};

/** One sentence on what happens next, shown to the employee. */
export const STATUS_HELP: Record<RequestStatus, string> = {
  draft: "Not sent yet. Make any changes, then submit it.",
  submitted: "Your coordinator will review it.",
  returned: "Your coordinator sent it back. Read the comment, fix the trips, then resubmit.",
  approved: "Approved. Finance will add it to the next payment batch.",
  denied: "This claim won't be paid. See the comment for why.",
  batched: "Finance has added it to a payment batch.",
  paid: "Paid.",
};

export const ACTION_LABEL: Record<RequestAction, string> = {
  submitted: "Submitted",
  withdrawn: "Withdrawn",
  resubmitted: "Resubmitted",
  approved: "Approved",
  returned: "Returned for changes",
  denied: "Denied",
  batched: "Added to a payment batch",
  unbatched: "Removed from a payment batch",
  paid: "Paid",
};

/** Claims that still need something from the employee. */
export const EMPLOYEE_ACTION_STATUSES: RequestStatus[] = ["draft", "returned"];
/** Claims that are open (not finished). */
export const OPEN_STATUSES: RequestStatus[] = ["draft", "submitted", "returned", "approved", "batched"];

export function claimNumber(ref: number) {
  return `M-${ref}`;
}

export function batchNumber(ref: number) {
  return `B-${ref}`;
}
