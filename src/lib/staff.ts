/**
 * Checking a staff record typed by an admin (add or edit a person). The database rules
 * (uniqueness, reviewers, not locking yourself out) are in src/lib/data/staff.ts.
 */
import type { Role } from "@/lib/auth/viewer";
import { normalizeEmail } from "@/lib/contact";
import { cleanName } from "@/lib/names";
import { normalizeUsPhone } from "@/lib/phone";

export const ALL_ROLES: Role[] = ["employee", "coordinator", "finance", "admin"];

export type StaffInput = {
  fullName: string;
  /** Lowercase, or null. */
  email: string | null;
  /** E.164, or null. */
  phone: string | null;
  roles: Role[];
  coordinatorId: string | null;
  siteId: string | null;
  /** Their contact name in Aplos when it differs from their full name. */
  aplosName: string | null;
  active: boolean;
};

export type StaffFields = {
  fullName: string;
  email: string;
  phone: string;
  roles: string[];
  coordinatorId: string;
  siteId: string;
  aplosName: string;
  active: boolean;
};

export type StaffErrors = Partial<Record<"fullName" | "email" | "phone" | "roles" | "aplosName", string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function checkStaffInput(f: StaffFields): { input: StaffInput | null; errors: StaffErrors } {
  const errors: StaffErrors = {};
  const fullName = cleanName(f.fullName);
  if (!fullName) errors.fullName = "Enter their full name.";
  else if (fullName.length > 120) errors.fullName = "That name is too long.";

  const emailText = f.email.trim();
  const email = emailText ? normalizeEmail(emailText) : null;
  if (emailText && !email) errors.email = "Enter an email address like name@sccsc.org.";
  const phoneText = f.phone.trim();
  const phone = phoneText ? normalizeUsPhone(phoneText) : null;
  if (phoneText && !phone) errors.phone = "Enter a 10-digit US mobile number, like (916) 555-0101.";
  if (!emailText && !phoneText) errors.email = "Add an email or a mobile number. It's how they sign in.";

  const roles = ALL_ROLES.filter((r) => f.roles.includes(r));
  if (roles.length === 0) errors.roles = "Choose at least one role.";

  const aplosName = cleanName(f.aplosName);
  if (aplosName.length > 120) errors.aplosName = "That name is too long.";

  if (Object.keys(errors).length) return { input: null, errors };
  return {
    input: {
      fullName,
      email,
      phone,
      roles,
      coordinatorId: UUID.test(f.coordinatorId) ? f.coordinatorId : null,
      siteId: UUID.test(f.siteId) ? f.siteId : null,
      aplosName: aplosName && aplosName !== fullName ? aplosName : null,
      active: f.active,
    },
    errors,
  };
}
