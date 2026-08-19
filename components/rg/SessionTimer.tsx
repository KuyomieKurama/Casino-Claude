"use client";

import { Clock, Pause, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRgStatus } from "@/state/RgContext";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDuration, formatDurationClock } from "@/lib/formatters";
import { cn } from "@/lib/cn";

export type SessionTimerProps = {
  variant?: "compact" | "full";
  className?: string;
};

/**
 * Aktuelle Spielzeit aus Zeitstempeln. Kompakt im Header, ausführlich auf der RG-Seite.
 * Vor der Hydration Skeleton in Zielgröße.
 */
export function SessionTimer({ variant = "full", className }: SessionTimerProps) {
  const status = useRgStatus(1000);

  if (variant === "compact") {
    return (
      <Link
        href="/responsible-gaming"
        className={cn("h-11 items-center gap-2 rounded-control border border-border-subtle bg-surface px-2.5 text-sm text-muted transition-state hover:border-gold hover:text-primary", className)}
        aria-label="Spielzeit dieser Sitzung – zu Responsible Gaming"
      >
        {status.blocked ? (
          status.reason === "paused" ? (
            <Pause className="size-4 text-warning" aria-hidden="true" />
          ) : (
            <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
          )
        ) : (
          <Clock className="size-4 text-teal" aria-hidden="true" />
        )}
        {status.hydrated ? <span className="tabular">{formatDurationClock(status.sessionElapsedMs)}</span> : <Skeleton className="h-4 w-[5ch]" />}
      </Link>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-sm text-muted">Aktuelle Spielzeit</span>
      {status.hydrated ? (
        <span className="tabular text-2xl font-semibold text-primary" aria-live="off">
          {formatDurationClock(status.sessionElapsedMs)}
        </span>
      ) : (
        <Skeleton className="h-8 w-[8ch]" />
      )}
      {status.hydrated && status.sessionRemainingMs !== undefined ? (
        <span className="text-sm text-muted">Verbleibend bis zum Zeitlimit: {formatDuration(status.sessionRemainingMs)}</span>
      ) : null}
    </div>
  );
}
