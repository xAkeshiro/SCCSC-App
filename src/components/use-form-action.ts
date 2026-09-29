"use client";

import { useActionState, useEffect, useRef, useTransition, type FormEvent } from "react";

/**
 * Like useActionState, but submits from onSubmit instead of <form action>.
 *
 * React 19 resets a form after an action runs. That clears controlled <select>s and checkboxes
 * in the browser even though React state still holds their values, so a form that comes back
 * with validation errors would lose what the person chose. Submitting this way skips the reset.
 * The clicked button's name/value (e.g. intent=another) is still sent.
 */
export function useFormAction<State>(action: (prev: State, formData: FormData) => Promise<State>, initial: State) {
  const [state, dispatch, pending] = useActionState<State, FormData>(
    action as (prev: Awaited<State>, formData: FormData) => Promise<State>,
    initial as Awaited<State>,
  );
  const [transitioning, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);

  // After a failed save, move focus to the first field with an error (or the error message).
  useEffect(() => {
    const form = formRef.current;
    if (!form || state === initial) return;
    const target = form.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
    if (!target) return;
    if (target.getAttribute("role") === "alert") target.setAttribute("tabindex", "-1");
    target.focus();
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state, initial]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    formRef.current = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending || transitioning] as const;
}
