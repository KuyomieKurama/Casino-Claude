"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type ErrorStateProps = {
  title: string;
  /** Was ist passiert → was jetzt tun; ohne Entschuldigung, ohne Stacktrace. */
  text?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  extra?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function ErrorState({ title, text, onRetry, retryLabel = "Erneut versuchen", extra, className, compact }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-danger/50 bg-surface text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
        className,
      )}
    >
      <AlertTriangle className="size-8 text-danger" aria-hidden="true" />
      <h3 className="text-md font-semibold text-primary">{title}</h3>
      {text ? <p className="measure text-sm text-muted">{text}</p> : null}
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <Button variant="outline" onClick={onRetry} iconLeft={<RotateCcw className="size-4" aria-hidden="true" />}>
            {retryLabel}
          </Button>
        ) : null}
        {extra}
      </div>
    </div>
  );
}
