import type { Game } from "@/types/game";
import { GameCard } from "./GameCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

/**
 * Raster: 2 Spalten mobil, 3 Tablet, 4–6 Desktop (§11).
 * `heading` fügt eine h2 über dem Raster ein (optional nur für Screenreader) — die Karten
 * tragen h3, ohne diese Zwischenebene entstünde ein Überschriftensprung h1 → h3.
 * `stagger-list` (siehe app/globals.css) lässt die Karten nacheinander statt schlagartig
 * eintreten — Aufrufer, die bei Filterwechsel sichtbar machen wollen, dass sich der Inhalt
 * geändert hat, geben zusätzlich einen React-`key` auf dem `<GameGrid>`-Element mit, der sich
 * mit den Filterkriterien ändert (siehe Lobby.tsx); ohne neuen `key` bleibt ein unverändertes
 * Element unangetastet, nur neu hinzugekommene Karten (z. B. „Mehr laden“) spielen die
 * Eintritts-Bewegung ab.
 */
export function GameGrid({
  games,
  className,
  dense,
  heading,
  headingHidden = true,
}: {
  games: readonly Game[];
  className?: string;
  dense?: boolean;
  heading?: string;
  headingHidden?: boolean;
}) {
  return (
    <>
    {heading ? <h2 className={headingHidden ? "sr-only" : "mb-3 text-md font-semibold text-primary"}>{heading}</h2> : null}
    {/* depth-scene (Auftrag Etappe 3 §3): gemeinsame Fluchtpunkt-Perspektive für die
        tilt-card-Kacheln darin — ohne sie wirkt die Kipp-Bewegung jeder Karte isoliert flach
        statt räumlich zueinander konsistent. Größere Rasterabstände (gap-lg/xl) lassen zusätzlich
        Raum für die leichte Anhebung im Hover, ohne benachbarte Karten zu berühren. */}
    <ul
      className={cn(
        "stagger-list depth-scene grid grid-cols-2 gap-lg md:gap-xl",
        dense ? "md:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5",
        className,
      )}
    >
      {games.map((g, i) => (
        <li key={g.id} className="min-w-0">
          <GameCard game={g} priority={i < 4} />
        </li>
      ))}
    </ul>
    </>
  );
}

export function GameGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-lg md:gap-xl md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface-raised overflow-hidden rounded-card border border-border-subtle bg-surface">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-lg">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
