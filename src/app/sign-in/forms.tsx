"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field, Notice, describedBy } from "@/components/ui";
import type { ContactKind } from "@/lib/contact";
import { requestCode, resendCode, verifyCode, type RequestCodeState, type VerifyCodeState } from "./actions";

/**
 * Step 1: name and email. People who'd rather use their phone number can switch
 * (`phoneAvailable`); the button text says how the code will arrive.
 */
export function RequestCodeForm({ sendLabels, phoneAvailable }: { sendLabels: Record<ContactKind, string>; phoneAvailable: boolean }) {
  const [state, action, pending] = useActionState<RequestCodeState, FormData>(requestCode, {});
  const [method, setMethod] = useState<ContactKind>("email");
  const switched = useRef(false);
  const contactInput = useRef<HTMLInputElement>(null);
  const e = state.errors ?? {};

  // After switching, put the cursor in the new field (not on first load).
  useEffect(() => {
    if (switched.current) contactInput.current?.focus();
  }, [method]);

  function switchTo(next: ContactKind) {
    switched.current = true;
    setMethod(next);
  }

  // Errors and typed values belong to the field they came from.
  const contactError = method === state.method ? e.contact : undefined;
  const contactValue = method === state.method ? state.values?.contact : undefined;
  const switchButton = phoneAvailable ? (
    <button
      type="button"
      onClick={() => switchTo(method === "email" ? "phone" : "email")}
      className="-my-1 rounded py-1 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
    >
      {method === "email" ? "Use phone number instead" : "Use email instead"}
    </button>
  ) : null;

  return (
    <form action={action} className="space-y-4 roomy:space-y-5" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <input type="hidden" name="method" value={method} />
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
      {method === "email" ? (
        <Field key="email" label="Email" htmlFor="email" action={switchButton} error={contactError}>
          <input
            ref={contactInput}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@example.com"
            className="field"
            required
            defaultValue={contactValue}
            {...describedBy("email", { error: contactError })}
          />
        </Field>
      ) : (
        <Field key="phone" label="Mobile number" htmlFor="phone" action={switchButton} error={contactError}>
          <input
            ref={contactInput}
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(916) 555-0123"
            className="field"
            required
            defaultValue={contactValue}
            {...describedBy("phone", { error: contactError })}
          />
        </Field>
      )}
      <Button type="submit" size="lg" className="mt-1 w-full roomy:mt-2" disabled={pending}>
        {pending ? "Sending…" : sendLabels[method]}
      </Button>
    </form>
  );
}

export function VerifyCodeForm({ resendLabel }: { resendLabel: string }) {
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
          {resending ? "Sending…" : resendLabel}
        </Button>
      </form>
    </div>
  );
}
