"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

export type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
  /** Element, das das Menü geöffnet hat — bekommt beim Schließen den Fokus zurück. */
  triggerRef: RefObject<HTMLElement | null>;
  title: string;
  id?: string;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Eigenständiges Überlagerungsmenü für Mobil/Tablet — bewusst kein natives `<dialog>`
 * (anders als components/ui/Modal.tsx): Fokusfalle, Escape-Schließen und Fokusrückgabe müssen
 * hier automatisiert prüfbar sein (Auftrag §7), jsdom implementiert `HTMLDialogElement.
 * showModal()` aber nicht vollständig (siehe test/dialog-polyfill.ts — kein echter Fokus-Trap,
 * kein Escape-„cancel“-Event ohne echten Browser). Deshalb wird das native Verhalten hier
 * explizit nachgebaut statt sich auf den Browser zu verlassen.
 */
export function MobileMenu({ open, onClose, triggerRef, title, id, children }: MobileMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) triggerRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    document.documentElement.style.overflow = "hidden";

    const panel = panelRef.current;
    const initial = focusableElements(panel)[0] ?? panel;
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusableElements(panel);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = "";
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div data-testid="mobile-menu-backdrop" aria-hidden="true" className="anim-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="anim-sheet-side signature-top absolute inset-y-0 right-0 flex h-full w-[min(320px,85vw)] flex-col bg-elevated shadow-2"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <p className="font-display text-lg text-primary">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Menü schließen"
            className="focus-glow -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-state hover:bg-surface hover:text-primary"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">{children}</div>
      </div>
    </div>
  );
}
