"use client";

import { useActionState } from "react";
import { Button, Field, Notice, describedBy } from "@/components/ui";
import { requestCode, resendCode, verifyCode, type RequestCodeState, type VerifyCodeState } from "./actions";

export function RequestCodeForm() {
  const [state, action, pending] = useActionState<RequestCodeState, FormData>(requestCode, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <Field label="Full name" htmlFor="name" hint="As on your paycheck" hintBeside error={e.name}>
        <input
          id="name"
          name="name"
          className="field"
          autoComplete="name"
          autoCapitalize="words"
          required
          defaultValue={state.values?.name}
          {...describedBy("name", { hint: true, error: e.name })}
        />
      </Field>
      <Field label="Mobile number" htmlFor="phone" hint="The one payroll has" hintBeside error={e.phone}>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(916) 555-0123"
          className="field"
          required
          defaultValue={state.values?.phone}
          {...describedBy("phone", { hint: true, error: e.phone })}
        />
      </Field>
      <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
        {pending ? "Sending…" : "Text me a code"}
      </Button>
    </form>
  );
}

export function VerifyCodeForm() {
  const [state, action, pending] = useActionState<VerifyCodeState, FormData>(verifyCode, {});
  const [resent, resend, resending] = useActionState<VerifyCodeState, FormData>(resendCode, {});
  const error = state.error ?? resent.error;
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-5" noValidate>
        {resent.resent && !state.error ? <Notice tone="success">We sent a new code.</Notice> : null}
        <Field label="6-digit code" htmlFor="code" error={error}>
          <input
            id="code"
            name="code"
            className="field text-center font-display text-2xl tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            {...describedBy("code", { error })}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Sign in"}
        </Button>
      </form>
      <form action={resend}>
        <Button type="submit" variant="ghost" size="sm" className="w-full" disabled={resending}>
          {resending ? "Sending…" : "Text me a new code"}
        </Button>
      </form>
    </div>
  );
}
