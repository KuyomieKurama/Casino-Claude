import { Info } from "lucide-react";
import { DEMO_STRIPE_TEXT } from "@/lib/constants";

/**
 * Demo-Kennzeichnung Ebene 1: Streifen oben auf jeder Seite, nicht schließbar (Regel 10).
 * Türkis auf dunkel; keine Schließen-Schaltfläche, absichtlich.
 */
export function DemoBanner() {
  return (
    <div
      role="note"
      aria-label="Demo-Hinweis"
      className="sticky top-0 z-50 flex h-[var(--demo-stripe-height)] items-center justify-center gap-2 border-b border-teal/40 bg-base px-3 text-xs font-medium tracking-wide text-teal sm:text-sm"
    >
      <Info className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{DEMO_STRIPE_TEXT}</span>
    </div>
  );
}
