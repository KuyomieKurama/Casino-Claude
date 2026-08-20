"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Bei „strict“ schließt weder Esc noch Backdrop — nur eine explizite Aktion. */
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
  /** Modal (zentriert), Drawer von unten (Mobil) bzw. von rechts (ab md). */
  presentation?: "modal" | "drawer";
  className?: string;
};

const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

/**
 * Natives <dialog> mit showModal(): Fokusfalle, Esc und Fokus-Rückgabe beim Schließen sind
 * Browserverhalten — nichts davon wird nachgebaut. Erste Fokusstelle: der Schließen-Button
 * bzw. das erste fokussierbare Element im Inhalt.
 */
export function Modal({ open, onClose, title, description, children, footer, dismissible = true, size = "md", presentation = "modal", className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Scrollen im Hintergrund unterbinden
      document.documentElement.style.overflow = "hidden";
    } else if (!open && el.open) {
      el.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (dismissible) onClose();
    };
    const onCloseEvt = () => {
      document.documentElement.style.overflow = "";
      if (open) onClose();
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("close", onCloseEvt);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("close", onCloseEvt);
    };
  }, [dismissible, onClose, open]);

  const isDrawer = presentation === "drawer";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => {
        // Klick auf den Backdrop (= das dialog-Element selbst, nicht sein Inhalt)
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 text-primary backdrop:bg-overlay/60",
        isDrawer
          ? "fixed inset-x-0 bottom-0 top-auto w-full md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[420px]"
          : "fixed inset-0 h-full w-full",
      )}
    >
      {open ? (
        <div
          className={cn(
            isDrawer ? "flex h-full w-full items-end md:items-stretch" : "flex min-h-full w-full items-end justify-center p-0 sm:items-center sm:p-4",
          )}
        >
          <div
            role="document"
            className={cn(
              // glass-panel-strong liefert Fläche, Rahmen und Weichzeichnung; surface-raised-strong
              // kombiniert die stärkste Elevation-Stufe (--shadow-raised) MIT dem Kantenlicht in
              // einer einzigen box-shadow-Deklaration (siehe app/globals.css) — für die am stärksten
              // angehobene Fläche der Oberfläche (Modal/Drawer stehen über allem anderen). Beide
              // Utilities sind @utility-Deklarationen und folgen normalen Kaskadenregeln, der
              // frühere Tailwind-„!“-Modifikator (nötig, solange glass-panel-strong ungelayertes
              // CSS war) entfällt.
              "flex w-full flex-col glass-panel-strong surface-raised-strong",
              isDrawer
                ? "max-h-[92dvh] rounded-t-modal anim-sheet-up md:max-h-none md:h-full md:rounded-none md:anim-sheet-side"
                : cn("max-h-[92dvh] rounded-t-modal sm:rounded-modal anim-sheet-up", widths[size]),
              className,
            )}
          >
            {/* Kein eigenes edge-light mehr am Header (anders als zuvor): surface-raised-strong
                oben liefert das Kantenlicht jetzt bereits auf der äußeren Karte selbst — optisch an
                derselben Stelle (der Header liegt ohne eigenen Rand/Abstand bündig an der Oberkante
                der Karte), aber ohne die frühere Notlösung, das Kantenlicht auf ein Kind-Element
                auszuweichen, nur um nicht mit der (damals erzwungenen) box-shadow des Elternelements
                zu kollidieren. */}
            <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold leading-tight">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-1 text-sm text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              {dismissible ? (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Schließen"
                  className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-state hover:bg-surface hover:text-primary"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              ) : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-5 py-4">{footer}</footer> : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
