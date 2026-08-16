"use client";

import { useMemo } from "react";
import { Heart } from "lucide-react";
import { useCatalog } from "@/state/CatalogContext";
import { suggestGames } from "@/lib/filters";
import { EmptyState } from "@/components/feedback/EmptyState";
import { AsyncBoundary } from "@/components/feedback/AsyncBoundary";
import { LinkButton } from "@/components/ui/Button";
import { GameGrid, GameGridSkeleton } from "./GameGrid";
import { GameCard } from "./GameCard";

/** Favoriten — dieselbe GameCard, Leerzustand mit drei Empfehlungen. */
export function FavoritesPage() {
  const { games, favorites, hydrated } = useCatalog();
  const list = useMemo(() => games.filter((g) => favorites.includes(g.id)), [games, favorites]);
  const suggestions = useMemo(() => suggestGames(games, list, 3), [games, list]);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Favoriten</h1>
        <p className="mt-1 text-sm text-muted">Deine markierten Spiele — auf diesem Gerät gespeichert.</p>
      </header>
      <AsyncBoundary status={hydrated ? "ready" : "loading"} skeleton={<GameGridSkeleton count={4} />}>
        {list.length === 0 ? (
          <EmptyState
            icon={<Heart aria-hidden="true" />}
            title="Noch keine Favoriten."
            text="Markiere Spiele mit dem Herz-Symbol auf einer Karte oder Detailseite. Drei Empfehlungen zum Start:"
            action={<LinkButton href="/casino" variant="primary">Spiele entdecken</LinkButton>}
          >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {suggestions.map((g) => (
                <li key={g.id}>
                  <GameCard game={g} />
                </li>
              ))}
            </ul>
          </EmptyState>
        ) : (
          <GameGrid games={list} dense heading="Deine Favoriten" />
        )}
      </AsyncBoundary>
    </div>
  );
}
