"use client";

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";
import { Button } from "@/components/ui/Button";

export type AsyncStatus = "loading" | "error" | "ready";

export type AsyncBoundaryProps = {
  status: AsyncStatus;
  /** Skeleton in Zielgröße */
  skeleton: ReactNode;
  errorTitle?: string;
  errorText?: ReactNode;
  onRetry?: () => void;
  onCancel?: () => void;
  /** Ab dieser Dauer erscheint im Ladezustand ein Zusatztext (§9: 3 s). */
  slowAfterMs?: number;
  children: ReactNode;
};

/**
 * Kapselt Laden, Fehler und Wiederholung um jeden datenabhängigen Bereich (Konzept 6.2).
 * Zusätzlich fängt eine Error Boundary Renderfehler des Inhalts ab — der Rest der Seite
 * bleibt bedienbar.
 */
export function AsyncBoundary({ status, skeleton, errorTitle, errorText, onRetry, onCancel, slowAfterMs = 3000, children }: AsyncBoundaryProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status !== "loading") {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(t);
  }, [status, slowAfterMs]);

  if (status === "loading") {
    return (
      <div aria-busy="true" aria-live="polite" className="relative">
        {skeleton}
        {slow ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>Das dauert länger als gewöhnlich. Der Inhalt wird weiterhin geladen.</span>
            {onCancel ? (
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Abbrechen
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="sr-only">Wird geladen …</span>
        )}
      </div>
    );
  }

  if (status === "error") {
    return (
      <ErrorState
        title={errorTitle ?? "Dieser Bereich konnte nicht geladen werden."}
        text={errorText ?? "Der simulierte Dienst hat nicht geantwortet. Du kannst es erneut versuchen; der Rest der Seite bleibt nutzbar."}
        onRetry={onRetry}
      />
    );
  }

  return <RenderErrorBoundary onRetry={onRetry}>{children}</RenderErrorBoundary>;
}

type BoundaryProps = { children: ReactNode; onRetry?: () => void };
type BoundaryState = { failed: boolean };

class RenderErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Bewusst nur in der Konsole — kein externes Tracking (Nicht-Ziel).
    console.error("Renderfehler in AsyncBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <ErrorState
          title="Hier ist etwas schiefgelaufen."
          text="Dieser Bereich konnte nicht dargestellt werden. Der Rest der Seite bleibt nutzbar."
          onRetry={() => {
            this.setState({ failed: false });
            this.props.onRetry?.();
          }}
        />
      );
    }
    return this.props.children;
  }
}
