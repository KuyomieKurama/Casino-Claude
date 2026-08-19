"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { useCatalog } from "@/state/CatalogContext";
import { providers } from "@/data/providers";
import { applyFilters, suggestGames, type LobbyCategory } from "@/lib/filters";
import { LOBBY_PAGE_SIZE } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { AsyncBoundary } from "@/components/feedback/AsyncBoundary";
import { GameGrid, GameGridSkeleton } from "./GameGrid";
import { GameCard } from "./GameCard";
import { SearchBar } from "./SearchBar";
import { CategoryTabs } from "./CategoryTabs";
import { FilterPanel } from "./FilterPanel";
import { useLobbyCriteria } from "./useLobbyCriteria";

const providerNames = Object.fromEntries(providers.map((p) => [p.id, p.name]));

/** Casino-Lobby (§8.2): Suche, Kategorien, Filter, Sortierung, Favoriten, „Mehr laden“, Leerzustand. */
export function Lobby() {
  const { games, favorites, hydrated } = useCatalog();
  const { criteria, update, reset } = useLobbyCriteria();
  const [visible, setVisible] = useState(LOBBY_PAGE_SIZE);

  const results = useMemo(() => applyFilters(games, { ...criteria, favorites }, providerNames), [games, criteria, favorites]);

  const counts = useMemo(() => {
    const base = { ...criteria, favorites };
    const cats: LobbyCategory[] = ["all", "favorites", "new", "popular"];
    const out: Partial<Record<LobbyCategory, number>> = {};
    for (const c of cats) out[c] = applyFilters(games, { ...base, cat: c }, providerNames).length;
    return out;
  }, [games, criteria, favorites]);

  const suggestions = useMemo(() => suggestGames(games, results, 3), [games, results]);

  // Neue Kriterien → wieder von vorn zeigen
  const criteriaKey = JSON.stringify(criteria);
  useEffect(() => {
    setVisible(LOBBY_PAGE_SIZE);
  }, [criteriaKey]);

  const onSearch = useCallback((q: string) => update({ q }, "replace"), [update]);

  const shown = results.slice(0, visible);
  const favoritesEmpty = criteria.cat === "favorites" && favorites.length === 0;

  return (
    <div className="space-y-6">
      <header className="space-y-4 pt-6">
        <div>
          <h1 className="font-display text-2xl text-primary sm:text-3xl">Casino-Lobby</h1>
          <p className="mt-1 text-sm text-muted">24 Spieltitel von sechs erfundenen Anbietern. Gespielt wird mit Credits, ohne Echtgeld.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBar value={criteria.q} onChange={onSearch} className="sm:max-w-md sm:flex-1" />
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <FilterPanel mode="drawer" criteria={criteria} onApply={(patch) => update(patch)} onReset={reset} />
            </div>
            <p className="ml-auto text-sm text-muted sm:ml-0" aria-live="polite">
              {hydrated ? (
                <>
                  <span className="tabular font-medium text-primary">{results.length}</span> {results.length === 1 ? "Spiel" : "Spiele"}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <CategoryTabs criteria={criteria} counts={counts} />
      </header>

      <div className="grid gap-lg lg:grid-cols-[260px_1fr]">
        <div className="hidden lg:block">
          <FilterPanel mode="sidebar" criteria={criteria} onApply={(patch) => update(patch)} onReset={reset} />
        </div>
        <section aria-label="Spiele" className="min-w-0">
          <AsyncBoundary status={hydrated ? "ready" : "loading"} skeleton={<GameGridSkeleton count={8} />}>
            {results.length === 0 ? (
              <EmptyState
                icon={<SearchX aria-hidden="true" />}
                title={favoritesEmpty ? "Noch keine Favoriten." : "Keine Spiele passen zu dieser Auswahl."}
                text={
                  favoritesEmpty
                    ? "Markiere Spiele mit dem Herz-Symbol, dann erscheinen sie hier."
                    : "Ändere Suchbegriff oder Filter, oder setze alles zurück. Drei Vorschläge findest du darunter."
                }
                action={
                  favoritesEmpty ? (
                    <Button variant="primary" onClick={() => update({ cat: "all" })}>
                      Spiele entdecken
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={reset}>
                      Filter zurücksetzen
                    </Button>
                  )
                }
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
              <>
                <GameGrid games={shown} />
                {shown.length < results.length ? (
                  <div className="mt-6 flex justify-center">
                    <Button variant="outline" onClick={() => setVisible((v) => v + LOBBY_PAGE_SIZE)}>
                      Mehr laden ({results.length - shown.length} weitere)
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </AsyncBoundary>
        </section>
      </div>
    </div>
  );
}
