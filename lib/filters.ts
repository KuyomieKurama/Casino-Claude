import type { Game, GameCategory, DemoDifficulty } from "@/types/game";

export type SortKey = "recommended" | "popularity" | "newest" | "name";

export type LobbyCategory = GameCategory | "all" | "new" | "popular" | "favorites";

export type FilterCriteria = {
  q: string;
  cat: LobbyCategory;
  provider: string;
  mechanic: string;
  difficulty: DemoDifficulty | "";
  sort: SortKey;
  /** Favoriten-IDs, damit der Reiter „Favoriten“ ohne React-Bezug filterbar ist. */
  favorites: readonly string[];
};

export const DEFAULT_CRITERIA: FilterCriteria = {
  q: "",
  cat: "all",
  provider: "",
  mechanic: "",
  difficulty: "",
  sort: "recommended",
  favorites: [],
};

const GAME_CATEGORIES: readonly GameCategory[] = [
  "slots",
  "roulette",
  "blackjack",
  "baccarat",
  "poker",
  "arcade",
  "gameshow",
  "live",
];
const LOBBY_CATEGORIES: readonly LobbyCategory[] = [...GAME_CATEGORIES, "all", "new", "popular", "favorites"];
const SORT_KEYS: readonly SortKey[] = ["recommended", "popularity", "newest", "name"];
const DIFFICULTIES: readonly DemoDifficulty[] = ["easy", "medium", "advanced"];

/**
 * Suchnormalisierung: Kleinschreibung, Umlaute und Akzente entfernt, ß → ss.
 * „Grun“ findet „Grün“, „sandkoenigin“ findet „Sandkönigin“.
 */
export function normalizeSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery(game: Game, q: string, providerNames: Record<string, string>): boolean {
  if (!q) return true;
  const haystack = normalizeSearch(
    [game.name, game.description, providerNames[game.providerId] ?? "", ...game.tags].join(" "),
  );
  return q.split(" ").every((term) => haystack.includes(term));
}

function matchesCategory(game: Game, cat: LobbyCategory, favorites: readonly string[]): boolean {
  switch (cat) {
    case "all":
      return true;
    case "new":
      return game.isNew;
    case "popular":
      return game.isPopular;
    case "favorites":
      return favorites.includes(game.id);
    default:
      return game.category === cat;
  }
}

export function sortGames(games: readonly Game[], sort: SortKey): Game[] {
  const copy = [...games];
  switch (sort) {
    case "popularity":
      return copy.sort((a, b) => b.popularityScore - a.popularityScore || a.name.localeCompare(b.name, "de"));
    case "newest":
      return copy.sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.name.localeCompare(b.name, "de"));
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name, "de"));
    case "recommended":
    default:
      // Empfehlung: aktive vor inaktiven, hervorgehobene zuerst, dann Beliebtheit.
      return copy.sort(
        (a, b) =>
          Number(a.status === "inactive") - Number(b.status === "inactive") ||
          Number(b.isFeatured) - Number(a.isFeatured) ||
          b.popularityScore - a.popularityScore ||
          a.name.localeCompare(b.name, "de"),
      );
  }
}

/**
 * Reine Filterfunktion ohne React-Bezug (§8.2). Anbieter-Namen werden übergeben,
 * damit die Volltextsuche auch „Northgate“ findet, ohne dass lib/ Daten importiert.
 */
export function applyFilters(
  games: readonly Game[],
  criteria: Partial<FilterCriteria>,
  providerNames: Record<string, string> = {},
): Game[] {
  const c: FilterCriteria = { ...DEFAULT_CRITERIA, ...criteria };
  const q = normalizeSearch(c.q);
  const filtered = games.filter(
    (g) =>
      matchesCategory(g, c.cat, c.favorites) &&
      (!c.provider || g.providerId === c.provider) &&
      (!c.mechanic || g.tags.includes(c.mechanic)) &&
      (!c.difficulty || g.demoDifficulty === c.difficulty) &&
      matchesQuery(g, q, providerNames),
  );
  return sortGames(filtered, c.sort);
}

/** Zählt gesetzte Filter (ohne Suche und Sortierung) für den Filter-Button-Badge. */
export function countActiveFilters(c: Partial<FilterCriteria>): number {
  return [c.provider, c.mechanic, c.difficulty].filter((v) => v && v.length > 0).length + (c.cat && c.cat !== "all" ? 1 : 0);
}

// ─── URL-Serialisierung: Kriterien liegen in der URL (?q=&cat=&provider=&sort=) ──

export function criteriaFromParams(params: URLSearchParams): Omit<FilterCriteria, "favorites"> {
  const cat = params.get("cat") ?? "all";
  const sort = params.get("sort") ?? "recommended";
  const difficulty = params.get("difficulty") ?? "";
  return {
    q: params.get("q") ?? "",
    cat: (LOBBY_CATEGORIES as readonly string[]).includes(cat) ? (cat as LobbyCategory) : "all",
    provider: params.get("provider") ?? "",
    mechanic: params.get("mechanic") ?? "",
    difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty) ? (difficulty as DemoDifficulty) : "",
    sort: (SORT_KEYS as readonly string[]).includes(sort) ? (sort as SortKey) : "recommended",
  };
}

export function paramsFromCriteria(c: Partial<Omit<FilterCriteria, "favorites">>): URLSearchParams {
  const params = new URLSearchParams();
  if (c.q) params.set("q", c.q);
  if (c.cat && c.cat !== "all") params.set("cat", c.cat);
  if (c.provider) params.set("provider", c.provider);
  if (c.mechanic) params.set("mechanic", c.mechanic);
  if (c.difficulty) params.set("difficulty", c.difficulty);
  if (c.sort && c.sort !== "recommended") params.set("sort", c.sort);
  return params;
}

/** Drei Vorschläge für den Leerzustand: beliebte, aktive Spiele, die nicht im Ergebnis sind. */
export function suggestGames(all: readonly Game[], exclude: readonly Game[], count = 3): Game[] {
  const excluded = new Set(exclude.map((g) => g.id));
  return sortGames(
    all.filter((g) => g.status === "active" && !excluded.has(g.id)),
    "popularity",
  ).slice(0, count);
}

/** „Ähnliche Spiele“: gleiche Kategorie, sonst gleiche Mechanik, aufgefüllt nach Beliebtheit. */
export function similarGames(all: readonly Game[], game: Game, count = 4): Game[] {
  const others = all.filter((g) => g.id !== game.id && g.status === "active");
  const sameCat = others.filter((g) => g.category === game.category);
  const sameTag = others.filter((g) => g.category !== game.category && g.tags.some((t) => game.tags.includes(t)));
  const rest = others.filter((g) => !sameCat.includes(g) && !sameTag.includes(g));
  return [...sortGames(sameCat, "popularity"), ...sortGames(sameTag, "popularity"), ...sortGames(rest, "popularity")].slice(0, count);
}
