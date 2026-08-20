"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { Game } from "@/types/game";
import { GameCard } from "./GameCard";
import { cn } from "@/lib/cn";

export type GameRowProps = {
  title: string;
  games: readonly Game[];
  href?: string;
  hrefLabel?: string;
  id?: string;
  className?: string;
};

/**
 * Horizontal scrollende Reihe (Startseite). Bewusst horizontal, mit sichtbarer Kante
 * (Maske) und Tastaturbedienung über die Pfeil-Buttons; Karten selbst sind fokussierbar.
 */
export function GameRow({ title, games, href, hrefLabel = "Alle ansehen", id, className }: GameRowProps) {
  const ref = useRef<HTMLUListElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };
  if (games.length === 0) return null;
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-4 px-4 sm:px-0">
        <h2 id={id ? `${id}-title` : undefined} className="font-display text-lg text-primary sm:text-xl">
          {title}
        </h2>
        <div className="flex items-center gap-1">
          {href ? (
            <Link href={href} className="mr-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold transition-state hover:text-gold-strong">
              {hrefLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label={`${title}: nach links scrollen`}
            className="hidden size-11 items-center justify-center rounded-control border border-border-control text-muted transition-state hover:border-gold hover:text-primary sm:inline-flex"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label={`${title}: nach rechts scrollen`}
            className="hidden size-11 items-center justify-center rounded-control border border-border-control text-muted transition-state hover:border-gold hover:text-primary sm:inline-flex"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* depth-scene (Auftrag Etappe 3 §3): dieselbe Fluchtpunkt-Perspektive wie im großen Raster,
          damit die tilt-card-Kacheln der Reihe im Hover konsistent räumlich wirken. */}
      <ul ref={ref} className="carousel carousel-mask depth-scene -mx-4 sm:mx-0 sm:px-0" aria-label={title}>
        {games.map((g) => (
          <li key={g.id}>
            <GameCard game={g} variant="compact" />
          </li>
        ))}
        <li aria-hidden="true" className="w-4 shrink-0" />
      </ul>
    </section>
  );
}
