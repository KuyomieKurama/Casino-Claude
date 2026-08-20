"use client";

import { useState } from "react";
import type { Game } from "@/types/game";
import { categoryColor, categoryLabel } from "@/data/categories";
import { cn } from "@/lib/cn";

/** Initialen aus dem Spielnamen: „Neon Nights“ → „NN“, „Baccarat“ → „BA“ */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export type GameArtProps = {
  game: Pick<Game, "name" | "thumbnail" | "thumbnailAlt" | "category" | "banner">;
  useBanner?: boolean;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

/**
 * Bild mit deterministischem Fallback: fehlt das Bild (leerer Pfad oder Ladefehler),
 * erscheint eine Initialen-Kachel in der Kategoriefarbe — Layout unverändert (§8.3, §9).
 *
 * Tiefenebene (Auftrag Etappe 3 §7): eine zusätzliche, rein dekorative Ebene über dem Bild bzw.
 * der Initialen-Kachel gibt der Fläche Volumen statt flächig zu wirken — ein dezenter Verlauf zur
 * Unterkante (aus --bg-base, per Deckkraft) plus dieselbe Kantenlicht-Haarlinie wie auf erhabenen
 * Flächen (.edge-light). Ausschließlich vorhandene Tokens, keine neuen Hex-Werte; `aria-hidden`,
 * da sie keine Information trägt (die Kategoriefarbe selbst bleibt über role="img"/sr-only bzw.
 * das <img>-alt zugänglich, siehe unten).
 */
export function GameArt({ game, useBanner, className, priority }: GameArtProps) {
  const src = useBanner ? game.banner || game.thumbnail : game.thumbnail;
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div className={cn("relative h-full w-full", className)}>
      {showFallback ? (
        <div
          role="img"
          aria-label={`${game.name} – kein Vorschaubild, Platzhalter mit Initialen`}
          className="flex h-full w-full items-center justify-center"
          style={{ backgroundColor: categoryColor(game.category) }}
        >
          <span className="font-display select-none text-3xl text-primary/90" aria-hidden="true">
            {initialsOf(game.name)}
          </span>
          <span className="sr-only">{categoryLabel(game.category)}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- lokale SVGs, keine Optimierung nötig
        <img
          src={src}
          alt={game.thumbnailAlt}
          onError={() => setFailed(true)}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="h-full w-full object-cover"
        />
      )}
      <div aria-hidden="true" className="edge-light pointer-events-none absolute inset-0 bg-linear-to-t from-base/55 to-transparent" />
    </div>
  );
}
