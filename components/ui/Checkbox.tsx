"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
};

/** Checkbox mit 44-px-Touch-Ziel und sichtbarem Fokus; niemals vorausgewählt (Regel 7). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, error, hint, id, className, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-primary", className)}>
        <span className="relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="peer absolute inset-0 size-5 cursor-pointer appearance-none rounded-[4px] border border-border-control bg-surface transition-state checked:border-gold checked:bg-gold"
            {...rest}
          />
          <Check className="pointer-events-none relative size-3.5 text-on-gold opacity-0 transition-state peer-checked:opacity-100" strokeWidth={3} aria-hidden="true" />
        </span>
        <span>{label}</span>
      </label>
      {hint ? (
        <p id={hintId} className="pl-8 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="pl-8 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
