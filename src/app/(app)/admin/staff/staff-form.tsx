"use client";

import { ArrowRightLeft, Save, UserPlus } from "lucide-react";
import { SiteSelect } from "@/components/site-select";
import { Button, ButtonLink, Card, Field, Notice, describedBy } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";
import type { Role } from "@/lib/auth/viewer";
import { ROLE_INFO } from "@/lib/roles";
import type { SiteGroup } from "@/lib/sites";
import { moveTeamTo, saveStaffMember, type StaffFormState } from "./actions";

export type StaffFormPerson = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
  coordinatorId: string | null;
  defaultSiteId: string | null;
  aplosName: string | null;
  active: boolean;
  signedIn: boolean;
};

/** Add a person (no `person`) or edit one. */
export function StaffForm({
  person,
  coordinators,
  siteGroups,
  phoneText,
}: {
  person: StaffFormPerson | null;
  coordinators: { id: string; fullName: string }[];
  siteGroups: SiteGroup[];
  /** The mobile number as it's shown, like (916) 555-0101. */
  phoneText: string;
}) {
  const [state, onSubmit, pending] = useFormAction<StaffFormState>(saveStaffMember.bind(null, person?.id ?? null), {});
  const e = state.errors ?? {};

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-xl">Who they are</h2>
        <Field
          label="Full name"
          htmlFor="fullName"
          hint="As they'll type it when they sign in, like on their Paychex record. Capitals and spaces don't matter."
          error={e.fullName}
        >
          <input
            id="fullName"
            name="fullName"
            className="field"
            autoComplete="off"
            defaultValue={person?.fullName ?? ""}
            required
            {...describedBy("fullName", { hint: true, error: e.fullName })}
          />
        </Field>
        <Field
          label="Name in Aplos"
          htmlFor="aplosName"
          optional
          hint="Only if their payee name in Aplos is different, like “Ellery, Rowan”. Payments for Aplos use it."
          error={e.aplosName}
        >
          <input
            id="aplosName"
            name="aplosName"
            className="field"
            autoComplete="off"
            defaultValue={person?.aplosName ?? ""}
            {...describedBy("aplosName", { hint: true, error: e.aplosName })}
          />
        </Field>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="text-xl">How they sign in</h2>
          <p className="mt-1 text-ink-500">
            They type their name and this email (or number) and get a code. Someone whose name and email match goes straight in.
          </p>
        </div>
        {person?.signedIn ? <Notice tone="info">They&apos;ve signed in before. Changing these won&apos;t sign them out.</Notice> : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Work email" htmlFor="email" hint="Sign-in codes go here." error={e.email}>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              className="field"
              defaultValue={person?.email ?? ""}
              {...describedBy("email", { hint: true, error: e.email })}
            />
          </Field>
          <Field label="Mobile number" htmlFor="phone" optional hint="For a text code instead." error={e.phone}>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className="field"
              defaultValue={phoneText}
              {...describedBy("phone", { hint: true, error: e.phone })}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-xl">What they do</h2>
        <fieldset aria-describedby={e.roles ? "roles-error" : undefined}>
          <legend className="field-label">Roles</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLE_INFO.map((r) => (
              <label key={r.value} className="flex min-h-12 items-start gap-3 rounded-[var(--radius-btn)] border border-ink-100 p-3 hover:bg-surface">
                <input
                  type="checkbox"
                  name="roles"
                  value={r.value}
                  defaultChecked={person ? person.roles.includes(r.value) : r.value === "employee"}
                  className="mt-1 size-5 shrink-0"
                />
                <span>
                  <span className="block font-semibold">{r.label}</span>
                  <span className="block text-sm text-ink-500">{r.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {e.roles ? (
            <span id="roles-error" role="alert" className="field-error">
              {e.roles}
            </span>
          ) : null}
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Who reviews their claims" htmlFor="coordinatorId" hint="Their coordinator. With nobody, an admin reviews them.">
            <select id="coordinatorId" name="coordinatorId" className="field" defaultValue={person?.coordinatorId ?? ""} aria-describedby="coordinatorId-hint">
              <option value="">Nobody (an admin reviews)</option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Usual school or site" htmlFor="siteId" optional hint="Filled in on their new trips and phone bills.">
            <SiteSelect id="siteId" name="siteId" groups={siteGroups} defaultValue={person?.defaultSiteId ?? ""} placeholder="None" aria-describedby="siteId-hint" />
          </Field>
        </div>
      </Card>

      {person ? (
        <Card className="p-5 sm:p-6">
          <fieldset>
            <legend className="text-xl font-display font-semibold">Status</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                { value: "active", label: "Active", hint: "Can sign in and use the app." },
                { value: "inactive", label: "Inactive", hint: "Left SCCSC or on leave. Can't sign in. Their claims and history stay." },
              ].map((o) => (
                <label key={o.value} className="flex min-h-12 items-start gap-3 rounded-[var(--radius-btn)] border border-ink-100 p-3 hover:bg-surface">
                  <input type="radio" name="status" value={o.value} defaultChecked={(o.value === "active") === person.active} className="mt-1 size-5 shrink-0" />
                  <span>
                    <span className="block font-semibold">{o.label}</span>
                    <span className="block text-sm text-ink-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {person ? <Save aria-hidden className="size-4" /> : <UserPlus aria-hidden className="size-4" />}
          {pending ? "Saving…" : person ? "Save changes" : "Add to the staff list"}
        </Button>
        <ButtonLink href="/admin/staff" variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

/** Moves everyone a coordinator reviews to someone else, before they change roles or leave. */
export function MoveTeamForm({ fromId, coordinators }: { fromId: string; coordinators: { id: string; fullName: string }[] }) {
  const [state, onSubmit, pending] = useFormAction<StaffFormState>(moveTeamTo.bind(null, fromId), {});
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Field label="Move them all to" htmlFor="move-to">
        <select id="move-to" name="to" className="field" defaultValue="">
          <option value="" disabled>
            Choose a reviewer…
          </option>
          {coordinators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
          <option value="none">Nobody (an admin reviews)</option>
        </select>
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <ArrowRightLeft aria-hidden className="size-4" /> {pending ? "Moving…" : "Move team"}
      </Button>
    </form>
  );
}
