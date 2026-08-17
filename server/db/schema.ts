import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { CATALOG_STATUS_VALUES, ENGINE_KEY_VALUES, GAME_CATEGORY_VALUES, GAME_MODE_KIND_VALUES } from "./enums";

/**
 * Katalog-Fundament: `provider` → `game` (Titel) → `game_mode` (Modus).
 *
 * Zentrale Designentscheidung (siehe Auftrag): Die heutige `Game.id` aus `data/games.ts`
 * (z. B. "g-european-roulette") wird zur `game_mode.id`. Darüber liegt `game` als dünne
 * Titel-Entität. Dadurch bleiben alle Paytable-Schlüssel (`gameId` und `gameId::betId`)
 * in `data/paytables/*` wortgleich — diese Dateien und die Engines ändern sich nicht.
 *
 * Geld: `bigint` mit `mode: "number"`. `pg` liefert bigint-Spalten standardmäßig als String
 * (Präzisionsschutz), Drizzle wandelt das in `mapFromDriverValue` selbst in eine Zahl um.
 * `MAX_BALANCE_MINOR` (99.999.999,99 → 9.999.999.999 Hundertstel) liegt über INT32
 * (2.147.483.647) und weit unter `Number.MAX_SAFE_INTEGER` — deshalb `bigint`, nicht `integer`,
 * und deshalb ist die Rückgabe als sicherer JS-`number` unproblematisch.
 *
 * Kein Enum: `text` + `CHECK`, siehe `./enums.ts` für die Begründung.
 *
 * Zeitstempel: `timestamptz` ohne `mode`-Option, also Drizzles Standard — die Spalten kommen
 * in TypeScript als `Date` an. Die Repositories wandeln beim Lesen explizit mit
 * `.toISOString()` in einen String um (Domänentyp `string`, wie im übrigen Projekt üblich,
 * z. B. `Game.releasedAt`), statt sich auf Drizzles abweichendes `mode: "string"`-Format
 * (Postgres-Stil mit Leerzeichen statt „T") zu verlassen.
 */

/**
 * Baut eine `CHECK (spalte IN (...))`-Bedingung aus einer festen Werteliste.
 *
 * Bewusst `sql.raw` statt gebundener Parameter: Ein generiertes Migrations-SQL-File wird von
 * drizzle-kit als reiner Text ausgeführt, nicht als vorbereitetes Statement mit Bindings — `$1,
 * $2, …`-Platzhalter in einer CHECK-Klausel wären dort unauflösbare Parameter und die Migration
 * würde fehlschlagen. Sicher ist das hier trotzdem: `values` kommt ausschließlich aus den
 * festen Konstanten in `./enums.ts`, nie aus Nutzereingaben.
 */
function checkIn(column: AnyPgColumn, values: readonly string[]): ReturnType<typeof sql> {
  const literals = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
  return sql`${column} in (${sql.raw(literals)})`;
}

export const provider = pgTable("provider", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const game = pgTable(
  "game",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category", { enum: GAME_CATEGORY_VALUES }).notNull(),
    providerId: text("provider_id")
      .notNull()
      .references(() => provider.id),
    description: text("description").notNull(),
    status: text("status", { enum: CATALOG_STATUS_VALUES }).notNull(),
    isFeatured: boolean("is_featured").notNull().default(false),
    isNew: boolean("is_new").notNull().default(false),
    isPopular: boolean("is_popular").notNull().default(false),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
    popularityScore: integer("popularity_score").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("game_slug_unique").on(t.slug),
    check("game_category_check", checkIn(t.category, GAME_CATEGORY_VALUES)),
    check("game_status_check", checkIn(t.status, CATALOG_STATUS_VALUES)),
  ],
);

export const gameMode = pgTable(
  "game_mode",
  {
    // = heutige Game.id aus data/games.ts (siehe Kommentar oben). Keine DB-generierte ID.
    id: text("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => game.id),
    /** Kurzschlüssel innerhalb des Titels, z. B. "european", "vip", "standard". */
    key: text("key").notNull(),
    /** Anzeigename des Modus, z. B. "Europäisch", "VIP", "Live". */
    label: text("label").notNull(),
    kind: text("kind", { enum: GAME_MODE_KIND_VALUES }).notNull(),
    engineKey: text("engine_key", { enum: ENGINE_KEY_VALUES }).notNull(),
    /**
     * Schlüssel in data/paytables/index.ts (paytablesOf). NULL für Modi ohne dokumentierte
     * Tabelle (Blackjack, Video Poker, Mines) — dort wird bewusst kein RTP behauptet.
     */
    paytableKey: text("paytable_key"),
    minBetMinor: bigint("min_bet_minor", { mode: "number" }).notNull(),
    maxBetMinor: bigint("max_bet_minor", { mode: "number" }).notNull(),
    isLivePresentation: boolean("is_live_presentation").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
    status: text("status", { enum: CATALOG_STATUS_VALUES }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Zwei Modi desselben Titels dürfen sich nicht denselben Kurzschlüssel teilen.
    uniqueIndex("game_mode_game_key_unique").on(t.gameId, t.key),
    // Genau ein Standardmodus je Titel: ein zweiter is_default=true für denselben game_id
    // verletzt diesen partiellen Unique-Index (Zeilen mit is_default=false sind unbegrenzt).
    uniqueIndex("game_mode_default_unique")
      .on(t.gameId)
      .where(sql`${t.isDefault} = true`),
    check("game_mode_kind_check", checkIn(t.kind, GAME_MODE_KIND_VALUES)),
    check("game_mode_engine_key_check", checkIn(t.engineKey, ENGINE_KEY_VALUES)),
    check("game_mode_status_check", checkIn(t.status, CATALOG_STATUS_VALUES)),
  ],
);
