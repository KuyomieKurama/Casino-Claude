"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { Game } from "@/types/game";
import { games as baseGames } from "@/data/catalog";
import { writeSlice } from "@/lib/storage";
import { usePersistence } from "./PersistenceContext";
import { applyOverrides, catalogReducer, initialCatalogState, toPersistedCatalog, type CatalogState, type GameOverride } from "./catalog-reducer";

type CatalogValue = {
  state: CatalogState;
  hydrated: boolean;
  /** Spiele inklusive Admin-Überschreibungen (M3). Einzige Quelle für die UI. */
  games: readonly Game[];
  favorites: readonly string[];
  isFavorite: (gameId: string) => boolean;
  toggleFavorite: (gameId: string) => void;
  setOverride: (gameId: string, override: GameOverride) => void;
  clearOverrides: () => void;
};

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({ children, initialGames }: { children: ReactNode; initialGames?: readonly Game[] }) {
  const persistence = usePersistence();
  const [state, dispatch] = useReducer(catalogReducer, initialCatalogState);

  useEffect(() => {
    if (persistence.hydrated && !state.hydrated) dispatch({ type: "HYDRATE", slice: persistence.slices.catalogPrefs });
  }, [persistence.hydrated, persistence.slices.catalogPrefs, state.hydrated]);

  useEffect(() => {
    if (state.hydrated) writeSlice("catalogPrefs", toPersistedCatalog(state));
  }, [state]);

  // `initialGames` kommt aus app/layout.tsx (Server Component, server/catalog/read-model.ts) —
  // der Katalog wird dort über die Repositories aus der Datenbank gelesen (Auftrag §1), genau
  // wie `user` bereits serverseitig gelesen und durchgereicht wird (siehe toClientUser() dort).
  // Optional statt Pflichtprop: bestehende Tests instanziieren <CatalogProvider> ohne DB-Anbindung
  // und dürfen unverändert funktionieren — dann bleibt data/catalog.ts der Fallback.
  const games = useMemo(() => applyOverrides(initialGames ?? baseGames, state.overrides), [initialGames, state.overrides]);
  const isFavorite = useCallback((id: string) => state.favorites.includes(id), [state.favorites]);
  const toggleFavorite = useCallback((gameId: string) => dispatch({ type: "TOGGLE_FAVORITE", gameId }), []);
  const setOverride = useCallback((gameId: string, override: GameOverride) => dispatch({ type: "SET_OVERRIDE", gameId, override }), []);
  const clearOverrides = useCallback(() => dispatch({ type: "CLEAR_OVERRIDES" }), []);

  const value = useMemo<CatalogValue>(
    () => ({ state, hydrated: state.hydrated, games, favorites: state.favorites, isFavorite, toggleFavorite, setOverride, clearOverrides }),
    [state, games, isFavorite, toggleFavorite, setOverride, clearOverrides],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  const v = useContext(CatalogContext);
  if (!v) throw new Error("useCatalog muss innerhalb von <CatalogProvider> verwendet werden.");
  return v;
}
