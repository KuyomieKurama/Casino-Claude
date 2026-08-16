import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  /** Überschriftenebene — auf eigenständigen Seiten (404, Admin-Gate) ist der Titel die h1. */
  headingLevel?: 1 | 2 | 3;
  text?: ReactNode;
  action?: ReactNode;
  /** z. B. drei Vorschläge unter der Aktion */
  children?: ReactNode;
  className?: string;
  compact?: boolean;
};

/** Ein EmptyState für alle Leerzustände: Icon, Titel, Text, Aktion (Konzept 6.2). */
export function EmptyState({ icon, title, text, action, children, className, compact, headingLevel = 3 }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border-control bg-surface text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10 sm:py-14",
        className,
      )}
    >
      {icon ? <div className="text-muted [&>svg]:size-8">{icon}</div> : null}
      <Heading className={cn("font-semibold text-primary", headingLevel === 1 ? "font-display text-xl" : compact ? "text-base" : "text-md")}>{title}</Heading>
      {text ? <p className="measure text-sm text-muted">{text}</p> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
      {children ? <div className="mt-4 w-full">{children}</div> : null}
    </div>
  );
}
