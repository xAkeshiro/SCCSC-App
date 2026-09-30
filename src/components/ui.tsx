/**
 * Small building blocks in the sccsc.org style: red rounded buttons, white cards with a soft
 * shadow, heart eyebrows above headings, big red stat numbers.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm",
  secondary: "border border-ink-300 bg-white text-ink hover:border-ink-500 hover:bg-ink-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  danger: "border border-brand-600 bg-white text-brand-700 hover:bg-brand-50",
  dark: "bg-ink text-white hover:bg-ink-700",
};

const sizes: Record<Size, string> = {
  sm: "min-h-10 px-3.5 text-[0.95rem]",
  md: "min-h-11 px-5 text-base",
  lg: "min-h-13 px-6 text-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-btn)] font-display font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ---------------------------------------------------------------------------------------------
// Layout and text
// ---------------------------------------------------------------------------------------------

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("card", className)} {...props} />;
}

/** The small red-heart label that sits above section headings on sccsc.org. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("flex items-center gap-2 font-display text-sm font-semibold text-ink", className)}>
      <HeartIcon className="size-4 shrink-0 text-brand-600" />
      {children}
    </p>
  );
}

export function HeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 21s-7.5-4.6-10-9.2C.4 8.6 2.1 4.5 6 4.1c2.1-.2 3.9.9 6 3.1 2.1-2.2 3.9-3.3 6-3.1 3.9.4 5.6 4.5 4 7.7C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <h1 className="text-[1.75rem] leading-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Big red number with a label under it, like the stats band on sccsc.org. */
export function Stat({ value, label, hint }: { value: ReactNode; label: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <p className="font-display text-3xl font-semibold text-brand-600 sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-ink-500">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <HeartIcon className="size-8 text-brand-200" />
      <h2 className="mt-3 text-xl">{title}</h2>
      {children ? <div className="mt-2 max-w-md text-ink-500">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "success" | "error";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-navy/20 bg-status-submitted-bg text-status-submitted",
    warning: "border-status-returned/25 bg-status-returned-bg text-status-returned",
    success: "border-status-approved/25 bg-status-approved-bg text-status-approved",
    error: "border-brand-600/30 bg-brand-50 text-brand-700",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-[var(--radius-btn)] border px-4 py-3", tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cx("text-[0.95rem]", title ? "mt-0.5" : "")}>{children}</div> : null}
    </div>
  );
}

/** Small rounded label, e.g. a program code. */
export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full bg-ink-50 px-2.5 py-0.5 text-xs font-semibold text-ink-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A heading with the pink brush stroke under one part, as on sccsc.org. */
export function BrushText({ children }: { children: ReactNode }) {
  return <span className="brush">{children}</span>;
}

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  hintBeside = false,
  action,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  /** Show the hint on the label's line (saves height on short forms). */
  hintBeside?: boolean;
  /** A small control on the label's line, like "Use phone number instead". */
  action?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className={hintBeside || action ? "mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3" : undefined}>
        <label htmlFor={htmlFor} className={cx("field-label", (hintBeside || Boolean(action)) && "mb-0")}>
          {label}
          {optional ? <span className="ml-1 font-normal text-ink-500">(optional)</span> : null}
        </label>
        {hint && hintBeside ? (
          <span id={`${htmlFor}-hint`} className="text-sm text-ink-500">
            {hint}
          </span>
        ) : null}
        {action}
      </div>
      {children}
      {hint && !hintBeside && !error ? (
        <span id={`${htmlFor}-hint`} className="field-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${htmlFor}-error`} className="field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** aria props that tie an input to its hint / error text. */
export function describedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }) {
  const ids = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean);
  return {
    "aria-describedby": ids.length ? ids.join(" ") : undefined,
    "aria-invalid": error ? true : undefined,
  } as const;
}
