import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "gold" | "success" | "warning" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  icon?: ReactNode;
  size?: "sm" | "md";
};

/**
 * Status nie allein über Farbe: Badges tragen immer Text (und optional ein Icon).
 * `accent` ist der Standard-Hinweiston, `gold` bleibt selten (Umriss, keine gefüllte Fläche —
 * Gold gehört der einen CTA-Fläche pro Bildschirm). Jeder Ton trägt eine leicht eingefärbte
 * Fläche (Opacity-Modifier auf dem eigenen Token) statt einer für alle Töne gleichen neutralen
 * Fläche — klarer unterscheidbar, ohne zusätzliche, ungeprüfte Farbwerte einzuführen.
 */
const tones: Record<BadgeTone, string> = {
  neutral: "border-border-control bg-base/70 text-muted",
  accent: "border-accent/50 bg-accent/10 text-accent",
  gold: "border-gold/60 bg-gold/10 text-gold",
  success: "border-success/50 bg-success/10 text-success",
  warning: "border-warning/50 bg-warning/10 text-warning",
  danger: "border-danger/50 bg-danger/10 text-danger",
};

export function Badge({ tone = "neutral", icon, size = "sm", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-pill border font-medium leading-none",
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
