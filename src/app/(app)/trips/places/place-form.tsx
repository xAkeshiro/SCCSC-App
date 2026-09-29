"use client";

import { useActionState } from "react";
import { Button, Field, Notice, describedBy } from "@/components/ui";
import { createPlace, type PlaceState } from "./actions";

export function PlaceForm() {
  const [state, action, pending] = useActionState<PlaceState, FormData>(createPlace, {});
  const e = state.errors ?? {};
  return (
    // A fresh form after each successful add.
    <form key={state.added ?? 0} action={action} className="space-y-4" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      {state.added ? <Notice tone="success">Place saved. It&apos;s now in the list when you log a trip.</Notice> : null}
      <Field label="Name" htmlFor="label" error={e.label} hint="What you'll see in the list.">
        <input id="label" name="label" className="field" placeholder="Home" {...describedBy("label", { hint: true, error: e.label })} />
      </Field>
      <Field label="Address" htmlFor="address" error={e.address}>
        <input
          id="address"
          name="address"
          className="field"
          autoComplete="street-address"
          placeholder="Street, city"
          {...describedBy("address", { error: e.address })}
        />
      </Field>
      <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-[var(--radius-btn)] border border-ink-100 p-3 hover:bg-surface">
        <input type="checkbox" name="is_home" className="mt-0.5 size-5" />
        <span>
          <span className="block font-semibold">This is my home</span>
          <span className="block text-sm text-ink-500">
            Your coordinator and finance will see “Home”, never the address.
          </span>
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save place"}
      </Button>
    </form>
  );
}
