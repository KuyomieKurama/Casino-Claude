import type { CreditsMinor } from "./money";

/**
 * Modus-Zusammenfassung für den Moduswechsel auf der Spieldetailseite (§3) und den
 * Geschwister-Hinweis auf Lobby-Kacheln (§2).
 *
 * Bewusst ein eigener, schlanker Typ statt `GameModeRecord` (server/repositories/types.ts):
 * `components/**` darf laut Schichtregel nichts aus `@/server/*` importieren. Diese Datei
 * liegt deshalb unter `types/`, die Server-Komposition (server/catalog/read-model.ts) bildet
 * `GameModeRecord` auf `GameModeSummary` ab, bevor die Daten als Prop in den Client-Baum
 * wandern (gleiches Muster wie `toClientUser()` in app/layout.tsx für Sitzungen).
 */
export type GameModeSummary = {
  /** = game_mode.id = heutige Game.id aus data/games.ts. */
  id: string;
  /** Routing-Slug aus data/games.ts — game_mode trägt keinen eigenen Slug (siehe Kommentar server/db/schema.ts). */
  slug: string;
  /** Anzeigename des Modus, z. B. "Europäisch", "VIP", "Live", "Standard". */
  label: string;
  status: "active" | "inactive";
  isDefault: boolean;
  isLivePresentation: boolean;
  minBetMinor: CreditsMinor;
  maxBetMinor: CreditsMinor;
};

/** Titel-Kontext für den Moduswechsel: der gemeinsame Name über allen Geschwistermodi. */
export type GameTitleSummary = {
  id: string;
  name: string;
};
