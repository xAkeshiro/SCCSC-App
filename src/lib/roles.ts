import type { Role } from "@/lib/auth/viewer";

/** What each role does, with who holds it at SCCSC, for the role pickers. */
export const ROLE_INFO: { value: Role; label: string; hint: string }[] = [
  { value: "employee", label: "Employee", hint: "Logs trips and phone bills. Everyone has this." },
  { value: "coordinator", label: "Coordinator", hint: "Reviews their team's claims (Sr. Program Manager, Program Managers)." },
  { value: "finance", label: "Finance", hint: "Pays approved claims through Aplos (CFO, Fiscal Operations Manager)." },
  { value: "admin", label: "Admin", hint: "Manages staff, budget codes, rates and rules." },
];

export const ROLE_LABEL = Object.fromEntries(ROLE_INFO.map((r) => [r.value, r.label])) as Record<Role, string>;
