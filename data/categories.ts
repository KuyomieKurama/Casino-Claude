import type { GameCategory, DemoDifficulty } from "@/types/game";

export type CategoryMeta = { id: GameCategory; label: string; color: string };

/** Kategoriefarben für die Initialen-Fallback-Kachel — nur dekorativ, Status nie allein über Farbe. */
export const categoryMeta: readonly CategoryMeta[] = [
  { id: "slots", label: "Slots", color: "#8B6B2E" },
  { id: "roulette", label: "Roulette", color: "#5A2E3A" },
  { id: "blackjack", label: "Blackjack", color: "#2E4A5A" },
  { id: "baccarat", label: "Baccarat", color: "#3E2E5A" },
  { id: "poker", label: "Poker", color: "#2E5A45" },
  { id: "arcade", label: "Arcade", color: "#2E5A5A" },
  { id: "gameshow", label: "Game Shows", color: "#5A4A2E" },
  { id: "live", label: "Live-Demos", color: "#2E3A5A" },
];

export function categoryLabel(id: GameCategory): string {
  return categoryMeta.find((c) => c.id === id)?.label ?? id;
}

export function categoryColor(id: GameCategory): string {
  return categoryMeta.find((c) => c.id === id)?.color ?? "#3A3F48";
}

/** Lobby-Kategorien inklusive virtueller Reiter (§8.2). */
export type LobbyCategoryId = GameCategory | "all" | "new" | "popular" | "favorites";

export const lobbyCategories: readonly { id: LobbyCategoryId; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "slots", label: "Slots" },
  { id: "roulette", label: "Roulette" },
  { id: "blackjack", label: "Blackjack" },
  { id: "baccarat", label: "Baccarat" },
  { id: "poker", label: "Poker" },
  { id: "arcade", label: "Arcade" },
  { id: "gameshow", label: "Game Shows" },
  { id: "live", label: "Live-Demos" },
  { id: "new", label: "Neu" },
  { id: "popular", label: "Beliebt" },
  { id: "favorites", label: "Favoriten" },
];

export const difficultyLabel: Record<DemoDifficulty, string> = {
  easy: "Einsteiger",
  medium: "Fortgeschritten",
  advanced: "Erfahren",
};

/** Kontrolliertes Vokabular für den Mechanik-Filter; Games referenzieren diese IDs in `tags`. */
export const mechanics: readonly { id: string; label: string }[] = [
  { id: "wild", label: "Wild-Symbole" },
  { id: "scatter", label: "Scatter" },
  { id: "freirunden", label: "Freirunden" },
  { id: "multiplikator", label: "Multiplikator" },
  { id: "kaskade", label: "Kaskaden" },
  { id: "bonusspiel", label: "Bonusspiel" },
  { id: "klassisch", label: "Klassisch" },
  { id: "strategie", label: "Strategie" },
  { id: "schnell", label: "Schnelle Runden" },
  { id: "tisch", label: "Tischspiel" },
  { id: "live", label: "Live-Simulation" },
];

export function mechanicLabel(id: string): string {
  return mechanics.find((m) => m.id === id)?.label ?? id;
}
