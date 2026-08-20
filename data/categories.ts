import type { GameCategory, DemoDifficulty } from "@/types/game";

export type CategoryMeta = { id: GameCategory; label: string; color: string };

/** Kategoriefarben für die Initialen-Fallback-Kachel — nur dekorativ, Status nie allein über Farbe.
 *  Dunkle, entsättigte Violett-/Blau-/Bronze-Töne (Redesign-Etappe „System-Fundament"), statt der
 *  vorigen bunten Tischfarben — passend zum violetten Primärakzent, alle mit >= 8,8:1 Kontrast zu
 *  --text-primary (auf der Initialen-Kachel, siehe components/game/GameArt.tsx) nachgerechnet. */
export const categoryMeta: readonly CategoryMeta[] = [
  { id: "slots", label: "Slots", color: "#4F3D22" },
  { id: "roulette", label: "Roulette", color: "#3C2A4D" },
  { id: "blackjack", label: "Blackjack", color: "#223247" },
  { id: "baccarat", label: "Baccarat", color: "#33254F" },
  { id: "poker", label: "Poker", color: "#1F2E3D" },
  { id: "arcade", label: "Arcade", color: "#4A3521" },
  { id: "gameshow", label: "Game Shows", color: "#55431F" },
  { id: "live", label: "Live", color: "#1C2740" },
];

export function categoryLabel(id: GameCategory): string {
  return categoryMeta.find((c) => c.id === id)?.label ?? id;
}

export function categoryColor(id: GameCategory): string {
  // Fallback (unerreichbar bei gültigem GameCategory, defensiv für den Fall neuer Kategorien ohne
  // gepflegten Eintrag) — neutraler, dunkler Ton aus derselben entsättigten Familie wie oben.
  return categoryMeta.find((c) => c.id === id)?.color ?? "#2E2C3A";
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
  { id: "live", label: "Live" },
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
