import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { checkIn } from "./check-in";
import { user } from "./auth-schema";
import {
  CATALOG_STATUS_VALUES,
  ENGINE_KEY_VALUES,
  GAME_CATEGORY_VALUES,
  GAME_MODE_KIND_VALUES,
  GAME_ROUND_ACTION_VALUES,
  GAME_ROUND_STATUS_VALUES,
  LEDGER_ENTRY_TYPE_VALUES,
} from "./enums";
import { DEFAULT_REMINDER_INTERVAL_MINUTES, MAX_BALANCE_MINOR } from "@/lib/constants";

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

/**
 * Wallet-Ledger (Phase 3a, Auftrag §1–§2): materialisierter Saldo (diese Tabelle) plus
 * Append-only-Historie (`ledgerEntry` unten). `wallet` ist absichtlich NICHT die Quelle der
 * Wahrheit für Geldbewegungen — sie ist ein Cache, dessen Stand jederzeit gegen die Summe der
 * `ledger_entry`-Zeilen desselben Nutzers nachrechenbar sein muss (siehe
 * server/repositories/wallet-repository.test.ts, Konsistenztest). Die Buchung selbst läuft über
 * ein bedingtes UPDATE direkt auf dieser Tabelle (server/repositories/wallet-repository.ts),
 * nicht über Lesen-dann-Schreiben — das ist der eigentliche Schutz gegen Wettläufe.
 *
 * `nextSeq` beginnt bei 1: der ERSTE Ledger-Eintrag eines Kontos (die Startguthaben-Buchung,
 * server/rounds/round-service.ts::ensureWallet) bekommt `seq = 1`, danach steht `nextSeq` auf 2.
 * Damit ist die Sequenznummer alleine aus der Wallet-Zeile ableitbar, ohne vorher `MAX(seq)`
 * über die Ledger-Tabelle laufen zu lassen.
 */
export const wallet = pgTable(
  "wallet",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id),
    demoBalanceMinor: bigint("demo_balance_minor", { mode: "number" }).notNull().default(0),
    bonusBalanceMinor: bigint("bonus_balance_minor", { mode: "number" }).notNull().default(0),
    freeSpins: integer("free_spins").notNull().default(0),
    nextSeq: bigint("next_seq", { mode: "number" }).notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Invariante 1 (Auftrag): Guthaben nie negativ, nie über der Obergrenze — auf Datenbankebene
    // erzwungen, nicht nur in der Anwendungslogik. Das bedingte UPDATE beim Einsatz (WHERE
    // demo_balance_minor >= :fromDemo AND bonus_balance_minor >= :fromBonus) verhindert zwar
    // bereits ein Unterschreiten von 0, dieser CHECK ist die zusätzliche, vom Anwendungscode
    // unabhängige Schranke — sie greift auch, falls ein künftiger Codepfad die Bedingung vergisst.
    // sql.raw() statt eines gebundenen Parameters: ein generiertes Migrations-SQL-File wird von
    // drizzle-kit als reiner Text ausgeführt (kein Prepared Statement) — ein `$1`-Platzhalter in
    // einer CHECK-Klausel wäre dort unauflösbar (siehe check-in.ts für dieselbe Begründung).
    // Unproblematisch: MAX_BALANCE_MINOR ist eine feste Konstante aus lib/constants.ts, nie aus
    // Nutzereingaben.
    check("wallet_demo_balance_check", sql`${t.demoBalanceMinor} >= 0 AND ${t.demoBalanceMinor} <= ${sql.raw(String(MAX_BALANCE_MINOR))}`),
    check("wallet_bonus_balance_check", sql`${t.bonusBalanceMinor} >= 0 AND ${t.bonusBalanceMinor} <= ${sql.raw(String(MAX_BALANCE_MINOR))}`),
    check("wallet_free_spins_check", sql`${t.freeSpins} >= 0`),
    check("wallet_next_seq_check", sql`${t.nextSeq} >= 1`),
  ],
);

/**
 * Eine Spielrunde. Nicht-interaktive Runden (Slots, Roulette, Baccarat, Dice, Plinko, Wheel,
 * Auftrag §3) durchlaufen `open` → `settled` INNERHALB derselben Datenbanktransaktion
 * (server/rounds/round-service.ts) — das Fenster ist damit sehr kurz, aber der partielle
 * Unique-Index unten ist trotzdem die reale Absicherung, nicht nur eine Attrappe: er ist
 * dieselbe Instanz, die künftige interaktive Runden (Phase 3b, echt mehrere Requests lang offen)
 * unverändert weiterverwenden.
 *
 * `seed`: bewusst `integer`, nicht `bigint` — der Seed wird mit `crypto.randomInt(0, 2**31)`
 * gezogen (server/rounds/round-service.ts), passt also in den 32-Bit-Wertebereich von
 * PostgreSQL `integer`. `mulberry32` (lib/rng.ts) behandelt den Seed intern ohnehin nur als
 * vorzeichenlose 32-Bit-Zahl (`seed >>> 0`) — der Wertebereich [0, 2^31) liefert dieselbe
 * Entropie- und Verteilungsqualität wie der volle Uint32-Bereich, den der Client bisher über
 * `createSeed()` erzeugt hat.
 */
export const gameRound = pgTable(
  "game_round",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    gameModeId: text("game_mode_id")
      .notNull()
      .references(() => gameMode.id),
    /** Kurzform der gewählten Wette für Anzeige/Debugging (z. B. "red", "straight", "player"). */
    betKey: text("bet_key"),
    stakeMinor: bigint("stake_minor", { mode: "number" }).notNull(),
    seed: integer("seed").notNull(),
    status: text("status", { enum: GAME_ROUND_STATUS_VALUES }).notNull().default("open"),
    outcomeKey: text("outcome_key"),
    returnMinor: bigint("return_minor", { mode: "number" }),
    maxReturnMinor: bigint("max_return_minor", { mode: "number" }).notNull(),
    /** Verhindert Doppelbuchung bei Doppelklick/erneutem Absenden — UNIQUE (user_id, idempotency_key) unten. */
    idempotencyKey: text("idempotency_key").notNull(),
    /**
     * Vollständiger, wiedergabefähiger Rundenkontext (Auftrag §8, Wiedergabetest): die vom Client
     * gewählte Wette (`betPayload`) plus vom Server erzeugte Anzeigedetails (`EngineOutcome.detail`).
     * `(gameModeId, stakeMinor, seed, betPayload)` aus dieser Spalte reicht aus, um dieselbe Runde
     * erneut aufzulösen und `returnMinor` exakt zu reproduzieren.
     */
    transcript: jsonb("transcript").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("game_round_user_idempotency_unique").on(t.userId, t.idempotencyKey),
    // Die Datenbankfassung von Invariante 4 (Auftrag): pro Nutzer höchstens eine offene Runde
    // gleichzeitig. Zeilen mit status != 'open' sind von diesem Index unbegrenzt (partieller Index).
    uniqueIndex("game_round_user_open_unique")
      .on(t.userId)
      .where(sql`${t.status} = 'open'`),
    check("game_round_status_check", checkIn(t.status, GAME_ROUND_STATUS_VALUES)),
    check("game_round_stake_check", sql`${t.stakeMinor} >= 0`),
    check("game_round_return_check", sql`${t.returnMinor} IS NULL OR ${t.returnMinor} >= 0`),
    check("game_round_max_return_check", sql`${t.maxReturnMinor} >= 0`),
  ],
);

/**
 * Aktionsprotokoll interaktiver Runden (Phase 3b, Auftrag §1): Blackjack, Video Poker und Mines
 * bleiben länger als einen Request offen — ihr Zustand entsteht NICHT aus einer veränderlichen
 * Zwischenspalte auf `gameRound`, sondern wird bei jeder Aktion aus dieser Tabelle neu abgeleitet
 * (server/rounds/interactive/*-adapter.ts::start + wiederholtes applyAction). Damit ist jede
 * Runde reproduzierbar und prüfbar (Wiedergabetest) und es gibt keinen zweiten, angreifbaren
 * Zustand, der vom Protokoll abweichen könnte.
 *
 * Append-only wie `ledgerEntry`: kein UPDATE, kein DELETE auf einer bestehenden Zeile.
 * `UNIQUE (round_id, seq)` ist zugleich die Idempotenzsicherung (Auftrag §1): Der Client übergibt
 * die Position der Aktion innerhalb der Runde (1, 2, 3, …); ein doppelt gesendeter Request mit
 * derselben `seq` trifft auf den bestehenden Datensatz und wird — bei gleichem Inhalt — als
 * bereits ausgeführt erkannt, statt ein zweites Mal zu buchen (server/rounds/round-action-
 * service.ts).
 */
export const gameRoundAction = pgTable(
  "game_round_action",
  {
    id: text("id").primaryKey(),
    roundId: text("round_id")
      .notNull()
      .references(() => gameRound.id),
    /** Position innerhalb der Runde, beginnend bei 1 — vom Client vorgegeben (siehe oben). */
    seq: integer("seq").notNull(),
    action: text("action", { enum: GAME_ROUND_ACTION_VALUES }).notNull(),
    /** Aktionsspezifische Nutzlast (z. B. { cell: 7 } bei Mines „reveal"), niemals ein Geldbetrag. */
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("game_round_action_round_seq_unique").on(t.roundId, t.seq),
    check("game_round_action_action_check", checkIn(t.action, GAME_ROUND_ACTION_VALUES)),
    check("game_round_action_seq_check", sql`${t.seq} >= 1`),
  ],
);

/**
 * Responsible-Gaming-Einstellungen je Nutzer (Auftrag „Server statt Client"): serverseitiges
 * Gegenstück zu `types/responsible-gaming.ts` (Feld für Feld, minus `sessionStartedAt` — das
 * kommt aus der aktiven `play_session`, nicht aus dieser Tabelle). Genau eine Zeile je Nutzer
 * (PK = user_id, wie `wallet` oben), bei Bedarf per `INSERT ... ON CONFLICT DO UPDATE` angelegt
 * (server/repositories/rg-settings-repository.ts) — ein neuer Nutzer ohne eigene Zeile gilt als
 * „keine Sperre, kein Limit, Standard-Erinnerungsintervall" (server/rg/rg-guard.ts), nie als
 * Fehler.
 *
 * `lift_requested_at`: trägt den in `types/responsible-gaming.ts` nicht abgebildeten Zwei-
 * Schritt-Ablauf zum Aufheben einer Selbstsperre (Auftrag §3: „darf niemals versehentlich durch
 * einen einzelnen Klick geschehen"). Ein `requestLift` setzt dieses Feld, `confirmLift` verlangt
 * es gesetzt UND innerhalb `RG_LIFT_CONFIRM_WINDOW_MS` (lib/constants.ts) — ein einzelner
 * `confirmLift`-Aufruf ohne vorausgehenden `requestLift` hebt dadurch nichts auf, selbst bei
 * einem direkten API-Aufruf unter Umgehung des Zwei-Schritt-Dialogs.
 */
export const rgSetting = pgTable(
  "rg_setting",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id),
    sessionLimitMinutes: integer("session_limit_minutes"),
    reminderIntervalMinutes: integer("reminder_interval_minutes").notNull().default(DEFAULT_REMINDER_INTERVAL_MINUTES),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    selfExcluded: boolean("self_excluded").notNull().default(false),
    selfExcludedAt: timestamp("self_excluded_at", { withTimezone: true }),
    liftRequestedAt: timestamp("lift_requested_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("rg_setting_session_limit_check", sql`${t.sessionLimitMinutes} IS NULL OR ${t.sessionLimitMinutes} > 0`),
    check("rg_setting_reminder_interval_check", sql`${t.reminderIntervalMinutes} > 0`),
  ],
);

/**
 * Serverseitiges Gegenstück zur bisherigen 30-Minuten-Lücken-Heuristik aus dem früheren
 * `state/rg-reducer.ts` (jetzt `lib/responsible-gaming.ts::SESSION_GAP_MS`): Höchstens eine
 * AKTIVE Sitzung je Nutzer gleichzeitig (`ended_at IS NULL`), erzwungen über den partiellen
 * Unique-Index unten — dasselbe Muster wie `game_round_user_open_unique`. Wird eine Sitzung
 * länger als `SESSION_GAP_MS` nicht berührt, schließt `server/repositories/play-session-
 * repository.ts::touchPlaySession` sie (setzt `ended_at`) und legt eine neue an, statt die
 * bestehende Zeile weiterzuschreiben — `started_at` der aktiven Zeile ist damit immer der
 * tatsächliche Beginn der laufenden Sitzung, nie ein über Lücken hinweg fortgeschriebener Wert.
 */
export const playSession = pgTable(
  "play_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("play_session_user_active_unique")
      .on(t.userId)
      .where(sql`${t.endedAt} IS NULL`),
    check("play_session_active_after_start_check", sql`${t.lastActiveAt} >= ${t.startedAt}`),
  ],
);

/**
 * Append-only Ledger (Auftrag §1): jede Guthabenänderung erzeugt genau eine Zeile hier
 * (Invariante 2), niemals ein UPDATE oder DELETE auf einer bestehenden Zeile — kein Codepfad in
 * `server/repositories/ledger-repository.ts` bietet das an. `balanceAfterMinor` ist immer die
 * Summe aus Demo- und Bonusguthaben unmittelbar NACH dieser Buchung (Invariante 3).
 */
export const ledgerEntry = pgTable(
  "ledger_entry",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    /** Monoton je Nutzer, aus `wallet.next_seq` (siehe dortiger Kommentar). */
    seq: bigint("seq", { mode: "number" }).notNull(),
    type: text("type", { enum: LEDGER_ENTRY_TYPE_VALUES }).notNull(),
    /** Einsatz negativ, Gutschrift positiv — wie `Transaction.amountMinor` (types/transaction.ts). */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    balanceAfterMinor: bigint("balance_after_minor", { mode: "number" }).notNull(),
    /** Nur bei `type = 'demo_bet'` gefüllt: wie sich der Einsatz auf die beiden Salden verteilt hat. */
    fromDemoMinor: bigint("from_demo_minor", { mode: "number" }),
    fromBonusMinor: bigint("from_bonus_minor", { mode: "number" }),
    gameModeId: text("game_mode_id").references(() => gameMode.id),
    roundId: text("round_id").references(() => gameRound.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_entry_user_seq_unique").on(t.userId, t.seq),
    check("ledger_entry_type_check", checkIn(t.type, LEDGER_ENTRY_TYPE_VALUES)),
  ],
);

/**
 * Admin-Audit-Log (Admin-Auftrag §4): Append-only wie `ledgerEntry` — kein UPDATE, kein DELETE
 * auf einer bestehenden Zeile in irgendeinem Repository. `before`/`after` sind bewusst `jsonb`
 * ohne festes Schema: Der Audit-Eintrag soll jede Art von Admin-Schreiboperation dokumentieren
 * können (Nutzerstatus, Spielstatus, …), ohne für jede Entität eine eigene Spalte zu brauchen.
 * `actorUserId` referenziert `user.id` — ein Audit-Eintrag ohne existierenden Urheber ist ein
 * Programmierfehler, kein gültiger Zustand (siehe server/admin/audit.ts: die Transaktion, die
 * diesen Eintrag schreibt, rollt bei einem Fremdschlüsselfehler vollständig zurück, damit „kein
 * Audit-Eintrag" tatsächlich „kein Commit" bedeutet).
 */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    /**
     * Global monoton wachsende Sequenznummer (Postgres `bigserial`), ausschließlich für die
     * Sortierung/Blätterung. `created_at` allein reicht dafür NICHT: mehrere Admin-Aktionen
     * innerhalb derselben Millisekunde (realistisch bei automatisierten Tests, aber auch bei
     * schnell aufeinanderfolgenden echten Klicks) hätten sonst identische Zeitstempel, und `id`
     * (ein zufälliges UUID, siehe lib/ids.ts) wäre als Tie-Breaker nicht chronologisch — die
     * Blätterung könnte Zeilen doppelt zeigen oder überspringen. `seq` ist dasselbe Muster wie
     * `ledgerEntry.seq`, hier aber global statt je Nutzer.
     */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    /** Kurzer, stabiler Aktionsname, z. B. "user.status.update" — keine Freitextbeschreibung. */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Blätterung ist immer absteigend nach seq sortiert (neueste zuerst) — dieser Index bedient
    // genau das, ohne bei wachsender Historie langsamer zu werden (kein Sequential Scan + Sort).
    uniqueIndex("admin_audit_log_seq_unique").on(t.seq),
    index("admin_audit_log_actor_idx").on(t.actorUserId),
  ],
);
