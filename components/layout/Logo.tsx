import Link from "next/link";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "@/lib/constants";
import { cn } from "@/lib/cn";

/**
 * Wortmarke in der Display-Schrift, mit einem kleinen Akzentpunkt (keine Fläche).
 *
 * Der Punkt saß bisher auf --gold. Das Logo steckt im globalen Header und erscheint damit auf
 * jedem Bildschirm — auch auf solchen mit eigenem goldenen Primär-CTA (z. B. dem Start-Button
 * eines Spiels). "Gold bleibt knapp" gilt pro Bildschirm, nicht nur pro Komponente: der Punkt
 * steht deshalb jetzt auf --accent-strong (violetter Primärakzent) und überlässt Gold vollständig
 * der jeweiligen Seiten-Aktion.
 */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-control", className)} aria-label={`${PRODUCT_NAME} – Startseite`}>
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-accent-strong" />
      <span className="font-display text-lg leading-none text-primary sm:text-xl">{compact ? PRODUCT_SHORT_NAME : PRODUCT_NAME}</span>
    </Link>
  );
}
