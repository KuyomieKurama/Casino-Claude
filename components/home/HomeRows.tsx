"use client";

import { useMemo } from "react";
import { useCatalog } from "@/state/CatalogContext";
import { engineFor } from "@/components/game/engine/registry";
import { sortGames } from "@/lib/filters";
import { GameRow } from "@/components/game/GameRow";
import { GameCard } from "@/components/game/GameCard";
import { Skeleton } from "@/components/ui/Skeleton";

/** Startseiten-Reihen (§8.1) — dieselbe GameCard wie überall, kompakte Variante. */
export function HomeRows() {
  const { games, hydrated } = useCatalog();
  const active = useMemo(() => games.filter((g) => g.status === "active"), [games]);
  const featured = useMemo(() => active.find((g) => g.isFeatured && engineFor(g.id)) ?? active[0], [active]);
  const popular = useMemo(() => sortGames(active.filter((g) => g.isPopular), "popularity"), [active]);
  const fresh = useMemo(() => sortGames(active, "newest").slice(0, 8), [active]);
  const slots = useMemo(() => sortGames(active.filter((g) => g.category === "slots"), "popularity"), [active]);
  const table = useMemo(
    () => sortGames(active.filter((g) => ["roulette", "blackjack", "baccarat", "poker"].includes(g.category)), "popularity"),
    [active],
  );
  const live = useMemo(() => sortGames(active.filter((g) => g.isLiveDemo), "popularity"), [active]);

  if (!hydrated) {
    return (
      <div className="space-y-lg" aria-busy="true">
        <Skeleton className="h-[280px] w-full rounded-card" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-7 w-48" />
            <div className="flex gap-4 overflow-hidden">
              {[0, 1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-[220px] w-[176px] shrink-0 rounded-card" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    // stagger-list (app/globals.css): die Reihen treten nacheinander ein, nicht schlagartig —
    // die Reihenfolge im Markup ist zugleich die Sichtreihenfolge (was zuerst gesehen werden
    // soll, erscheint zuerst). Der direkte Kind-Wrapper des hervorgehobenen Spiels trägt
    // anim-panel-in (statt der generischen rise-in-Bewegung): eine ruhige, aber spürbare eigene
    // Präsenz (minimales Skalieren zusätzlich zum Verschieben) — ganz ohne zusätzliche Farbe.
    // Die anim-panel-in-Klasse muss am direkten Kind von .stagger-list sitzen (hier: <section>),
    // nicht an der GameCard selbst (verschachtelt darin), sonst greift die :not(.anim-panel-in)-
    // Ausnahme nicht und beide Bewegungen würden sich addieren.
    <div className="stagger-list space-y-xl sm:space-y-2xl">
      {featured ? (
        <section aria-labelledby="featured-title" className="anim-panel-in">
          <h2 id="featured-title" className="sr-only">
            Hervorgehobenes Spiel
          </h2>
          <GameCard game={featured} variant="featured" priority />
        </section>
      ) : null}
      <GameRow id="popular" title="Beliebte Spiele" games={popular} href="/casino?cat=popular" />
      <GameRow id="new" title="Neu hinzugefügt" games={fresh} href="/casino?cat=new" />
      <GameRow id="slots" title="Slots" games={slots} href="/casino?cat=slots" />
      <GameRow id="table" title="Tischspiele" games={table} href="/casino?cat=blackjack" hrefLabel="Zur Lobby" />
      <GameRow id="live" title="Live-Casino" games={live} href="/live-casino" />
    </div>
  );
}
