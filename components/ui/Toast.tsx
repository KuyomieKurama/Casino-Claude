"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms; 0 = bleibt bis zum Schließen */
  duration?: number;
  action?: { label: string; onClick: () => void };
};

type ToastItem = ToastInput & { id: number };

type ToastApi = {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast muss innerhalb von <ToastProvider> verwendet werden.");
  return api;
}

const icons: Record<ToastTone, ReactNode> = {
  info: <Info className="size-5 text-teal" aria-hidden="true" />,
  success: <CheckCircle2 className="size-5 text-success" aria-hidden="true" />,
  warning: <AlertTriangle className="size-5 text-warning" aria-hidden="true" />,
  danger: <XCircle className="size-5 text-danger" aria-hidden="true" />,
};

const toneLabel: Record<ToastTone, string> = { info: "Hinweis", success: "Erfolg", warning: "Warnung", danger: "Fehler" };

/**
 * Toasts mit aria-live="polite" (§12). Fehler-Toasts nutzen role="alert".
 * Positioniert oberhalb der Bottom-Nav, damit nichts verdeckt wird.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++counter.current;
      const duration = input.duration ?? (input.tone === "danger" ? 8000 : 5000);
      setItems((prev) => [...prev.slice(-3), { ...input, id }]);
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      >
        {items.map((t) => {
          const tone = t.tone ?? "info";
          return (
            <div
              key={t.id}
              role={tone === "danger" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-border-subtle bg-elevated p-3 shadow-2 anim-rise-in",
              )}
            >
              <span className="mt-0.5 shrink-0">{icons[tone]}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-primary">
                  <span className="sr-only">{toneLabel[tone]}: </span>
                  {t.title}
                </p>
                {t.description ? <p className="mt-0.5 text-muted">{t.description}</p> : null}
                {t.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-2 inline-flex min-h-11 items-center rounded-control px-2 font-medium text-gold transition-state hover:text-gold-strong"
                  >
                    {t.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Meldung schließen"
                className="-mr-1 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-state hover:bg-surface hover:text-primary"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
