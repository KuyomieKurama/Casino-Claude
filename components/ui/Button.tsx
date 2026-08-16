"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Varianten: `primary` ist die einzige goldene Fläche — höchstens eine pro Bildschirm (§4).
 * Alles andere ist Umriss oder Text. Fokusring bleibt immer sichtbar.
 */
export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
};

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-medium select-none transition-state " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 whitespace-nowrap";

const sizes: Record<ButtonSize, string> = {
  // `sm` ist bewusst 36 px hoch und deshalb NUR für Bedienelemente gedacht, die in einem
  // größeren Klickziel liegen (z. B. innerhalb einer Karte). Steht ein Button für sich,
  // verlangt die Touch-Ziel-Regel (§12) mindestens 44 px — dann `md` verwenden.
  sm: "h-9 min-h-9 px-3 text-sm",
  md: "h-11 min-h-11 px-4 text-base",
  lg: "h-12 min-h-12 px-6 text-md",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-gold text-on-gold on-gold-surface hover:bg-gold-strong",
  outline: "border border-border-control bg-transparent text-primary hover:border-gold hover:text-gold-strong",
  ghost: "bg-transparent text-primary hover:bg-elevated",
  danger: "border border-danger bg-transparent text-danger hover:bg-elevated",
};

export function buttonClasses(opts: CommonProps = {}): string {
  const { variant = "outline", size = "md", fullWidth, className } = opts;
  return cn(base, sizes[size], variants[variant], fullWidth && "w-full", className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", loading = false, iconLeft, iconRight, fullWidth, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export type LinkButtonProps = CommonProps & {
  href: string;
  prefetch?: boolean;
  "aria-label"?: string;
};

/** Link im Button-Gewand — für Navigation, damit Semantik (Link) und Optik (Button) stimmen. */
export function LinkButton({ href, variant = "outline", size = "md", iconLeft, iconRight, fullWidth, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}
