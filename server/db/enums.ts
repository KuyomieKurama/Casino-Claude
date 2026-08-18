import type { Game, GameCategory } from "@/types/game";
import type { TransactionType } from "@/types/transaction";

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

/**
 * Rollen/Status-Werte für `user` (server/db/auth-schema.ts, Phase 1).
 *
 * Kein better-auth-Plugin liefert dieses exakte Schema: Das `admin`-Plugin der Bibliothek
 * modelliert Sperren über `banned`/`banReason`/`banExpires` (bool/text/timestamp), nicht über
 * ein `text` + `CHECK`-Statusfeld wie im übrigen Projekt üblich. Deshalb werden `role` und
 * `status` als eigene Spalten geführt (im Auftrag als Fallback ausdrücklich vorgesehen: „sonst
 * role selbst im Schema führen").
 */
export const USER_ROLE_VALUES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLE_VALUES)[number];

export const USER_STATUS_VALUES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUS_VALUES)[number];

/** Ziel eines Login-Versuchs für die gestaffelte Rate-Begrenzung, siehe server/auth/rate-limit.ts. */
export const LOGIN_ATTEMPT_SUBJECT_KIND_VALUES = ["email", "ip"] as const;
export type LoginAttemptSubjectKind = (typeof LOGIN_ATTEMPT_SUBJECT_KIND_VALUES)[number];

/**
 * Ledger-Buchungsarten (Phase 3a, Auftrag §1). Wortgleich zu `TransactionType` aus
 * `types/transaction.ts` — dieselbe Werteliste, aus demselben Grund wie oben (kein
 * PostgreSQL-Enum, `text` + `CHECK`). `types/transaction.ts` bleibt die eine Quelle der
 * Wahrheit für den Client; hier steht dieselbe Liste `satisfies` geprüft, damit ein künftiger
 * neuer Wert dort NICHT stillschweigend an dieser Stelle fehlt.
 */
export const LEDGER_ENTRY_TYPE_VALUES = [
  "demo_credit",
  "demo_bet",
  "demo_win",
  "bonus_grant",
  "free_spin",
  "reset",
] as const satisfies readonly TransactionType[];
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPE_VALUES)[number];

/**
 * Lebenszyklus einer Spielrunde (`game_round`, server/db/schema.ts). Nicht-interaktive Runden
 * durchlaufen `open` → `settled` innerhalb derselben Datenbanktransaktion (Auftrag §3); `voided`
 * bleibt für künftige interaktive Runden (Phase 3b, z. B. eine wegen Absturzes nie abgeschlossene
 * Runde) reserviert und wird von dieser Phase nicht erzeugt.
 */
export const GAME_ROUND_STATUS_VALUES = ["open", "settled", "voided"] as const;
export type GameRoundStatus = (typeof GAME_ROUND_STATUS_VALUES)[number];
