import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "teal" | "gold" | "success" | "warning" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  icon?: ReactNode;
  size?: "sm" | "md";
};

/**
 * Status nie allein über Farbe: Badges tragen immer Text (und optional ein Icon).
 * `teal` ist die Demo-Kennzeichnung; `gold` bleibt Umriss, keine gefüllte Fläche.
 */
const tones: Record<BadgeTone, string> = {
  neutral: "border-border-control text-muted",
  teal: "border-teal/60 text-teal",
  gold: "border-gold/70 text-gold",
  success: "border-success/60 text-success",
  warning: "border-warning/60 text-warning",
  danger: "border-danger/60 text-danger",
};

export function Badge({ tone = "neutral", icon, size = "sm", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-pill border bg-base/70 font-medium leading-none",
        size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-sm",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

/** Kürzel „DEMO“ — Ebene 2 der Kennzeichnung im Header. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="teal" className={cn("tracking-wider", className)} aria-label="Demo-Modus">
      DEMO
    </Badge>
  );
}
