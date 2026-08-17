import type { Game, GameCategory } from "@/types/game";

/**
 * Werte-Quellen für CHECK-Constraints (server/db/schema.ts) und Domänentypen
 * (server/repositories/types.ts).
 *
 * Warum keine PostgreSQL-Enums (Regel aus dem Auftrag): Ein `ALTER TYPE ... ADD VALUE`
 * ist migrationstechnisch unhandlich (u. a. nicht in derselben Transaktion wie sein
 * erster Gebrauch nutzbar) und jede neue Kategorie würde eine eigene Migration mit
 * Typ-Änderung erzwingen. `text` + `CHECK` lässt sich mit Drizzle-Migrationen einfach
 * erweitern; die TypeScript-String-Literal-Union bleibt die alleinige Quelle der Wahrheit.
 *
 * GAME_CATEGORY_VALUES und CATALOG_STATUS_VALUES spiegeln die bestehenden Unions aus
 * `types/game.ts`. `satisfies` stellt sicher, dass hier keine ungültigen Werte stehen —
 * bei einer neuen Kategorie in `types/game.ts` muss diese Liste von Hand ergänzt werden,
 * ein automatischer Abgleich ist zur Laufzeit nicht möglich (TypeScript-Typen existieren
 * nach dem Kompilieren nicht mehr).
 */
export const GAME_CATEGORY_VALUES = [
  "slots",
  "roulette",
  "blackjack",
  "baccarat",
  "poker",
  "arcade",
  "gameshow",
  "live",
] as const satisfies readonly GameCategory[];

/** Gemeinsamer Status von `game` und `game_mode` — identisch zum heutigen `Game.status`. */
export const CATALOG_STATUS_VALUES = ["active", "inactive"] as const satisfies readonly Game["status"][];

/**
 * `variant`: eigenständiges Regelwerk (z. B. American vs. European Roulette).
 * `presentation`: teilt Regeln und Auszahlungstabelle mit einer anderen Variante und
 * unterscheidet sich nur in Präsentation bzw. Einsatzgrenzen (Live-Tische, VIP Blackjack).
 */
export const GAME_MODE_KIND_VALUES = ["variant", "presentation"] as const;
export type GameModeKind = (typeof GAME_MODE_KIND_VALUES)[number];

/**
 * Engine-Familien aus `components/game/engine/{familie}/` bzw. `.../slot/`
 * (siehe `components/game/engine/registry.tsx`). Eine Familie bedient mehrere Modi
 * (z. B. bedient die Slot-Engine alle elf Slot-Titel).
 */
export const ENGINE_KEY_VALUES = [
  "slot",
  "roulette",
  "blackjack",
  "baccarat",
  "videopoker",
  "plinko",
  "mines",
  "dice",
  "wheel",
] as const;
export type EngineKey = (typeof ENGINE_KEY_VALUES)[number];
