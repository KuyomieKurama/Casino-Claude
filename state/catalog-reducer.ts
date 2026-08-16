import type { Game } from "@/types/game";

/**
 * Katalog-Reducer: Favoriten und (ab M3) Admin-Überschreibungen einzelner Spiele.
 * Die Spieldaten selbst kommen aus data/games.ts; hier liegen nur Nutzerpräferenzen.
 */

export type GameOverride = Partial<Pick<Game, "status" | "isFeatured" | "isNew" | "isPopular" | "name" | "tags" | "category" | "providerId" | "description">>;

export type CatalogState = {
  hydrated: boolean;
  favorites: string[];
  overrides: Record<string, GameOverride>;
};

export type CatalogAction =
  | { type: "HYDRATE"; slice: unknown }
  | { type: "TOGGLE_FAVORITE"; gameId: string }
  | { type: "SET_OVERRIDE"; gameId: string; override: GameOverride }
  | { type: "CLEAR_OVERRIDES" };

export const initialCatalogState: CatalogState = { hydrated: false, favorites: [], overrides: {} };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function toPersistedCatalog(state: CatalogState) {
  return { favorites: state.favorites, overrides: state.overrides };
}

export function catalogReducer(state: CatalogState, action: CatalogAction): CatalogState {
  switch (action.type) {
    case "HYDRATE": {
      if (!isRecord(action.slice)) return { ...state, hydrated: true };
      const favorites = Array.isArray(action.slice.favorites)
        ? action.slice.favorites.filter((f): f is string => typeof f === "string")
        : [];
      const overrides = isRecord(action.slice.overrides) ? (action.slice.overrides as Record<string, GameOverride>) : {};
      return { hydrated: true, favorites: Array.from(new Set(favorites)), overrides };
    }
    case "TOGGLE_FAVORITE": {
      const has = state.favorites.includes(action.gameId);
      return {
        ...state,
        favorites: has ? state.favorites.filter((id) => id !== action.gameId) : [...state.favorites, action.gameId],
      };
    }
    case "SET_OVERRIDE":
      return { ...state, overrides: { ...state.overrides, [action.gameId]: { ...state.overrides[action.gameId], ...action.override } } };
    case "CLEAR_OVERRIDES":
      return { ...state, overrides: {} };
    default:
      return state;
  }
}

export function applyOverrides(games: readonly Game[], overrides: Record<string, GameOverride>): Game[] {
  return games.map((g) => (overrides[g.id] ? { ...g, ...overrides[g.id] } : g));
}
