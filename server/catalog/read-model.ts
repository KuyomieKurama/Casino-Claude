import { z } from "zod";
import type { Game } from "@/types/game";
import type { GameModeSummary, GameTitleSummary } from "@/types/game-mode";
import { findGameById as findStaticGameById } from "@/data/games";
import type { AppDatabase } from "@/server/db/types";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { PgGameRepository } from "@/server/repositories/game-repository";
import type { GameModeRecord } from "@/server/repositories/types";

/**
 * Liest den Katalog (Lobby, Startseite, Spieldetailseite) über die Repositories aus der
 * Datenbank statt direkt aus `data/games.ts` — Kern von Auftrag §1.
 *
 * Aufteilung der Zuständigkeit zwischen Datenbank und `data/games.ts` (bewusst, nicht geraten):
 *
 * `game_mode` bildet PRO MODUS (nicht pro Titel) exakt die heutigen Felder aus data/games.ts ab
 * (server/seed/seed.ts::buildGameModeInputs liest je Modus seine EIGENE Quellzeile) — deshalb
 * sind `status`, `min_bet_minor`, `max_bet_minor` und `label` je Modus aus der Datenbank
 * authoritativ und werden hier verwendet (Auftrag §3: "Einsatzgrenzen kommen aus dem Modus").
 *
 * `game` (Titel) trägt dagegen NUR die Felder des jeweiligen STANDARDMODUS (buildGameInput liest
 * nur die defaultMode-Quellzeile) — für Geschwistermodi wie „American Roulette“ oder
 * „Live Roulette Demo“ hätte ein Titel-Override von category/providerId/isFeatured/isNew/
 * isPopular/popularityScore/releasedAt die bisherige Modus-Genauigkeit stillschweigend
 * überschrieben (American Roulette würde z. B. den Anbieter und die Beliebtheit von European
 * Roulette erben, die drei Live-Demos würden ihre Kategorie "live" verlieren). Diese Felder
 * bleiben deshalb bewusst bei `data/games.ts` (Quelle der Wahrheit für den Seed, siehe
 * server/seed/grouping.ts-Kommentar) — die Modus-Ebene der Datenbank ist für sie schlicht nicht
 * granular genug. Rein darstellerische Felder ohne DB-Spalte (Thumbnail, Tags, Volatilität,
 * Schwierigkeit, Beschreibung) kommen ohnehin nur aus `data/games.ts`.
 *
 * Kein `import "server-only"` hier (anders als server/db/client.ts, server/auth/index.ts):
 * diese Funktionen nehmen `db: AppDatabase` als Parameter entgegen statt selbst eine Verbindung
 * aufzubauen — dasselbe Muster wie die Repositories in server/repositories/*.ts. Dadurch laufen
 * sie unverändert gegen PGlite in Tests (server/db/test-harness.ts) und gegen die echte
 * Verbindung in app/layout.tsx/app/game/[slug]/page.tsx. Der Layer-Schutz kommt hier über
 * ESLint (`components/`/`state/` dürfen laut eslint.config.mjs nicht aus `@/server/*` importieren),
 * nicht über den `server-only`-Laufzeit-Guard.
 */

// ─── Validierung ─────────────────────────────────────────────────────────────
// Externe Daten (hier: aus der Datenbank gelesene Zeilen) werden vor der Weitergabe an
// Client-Komponenten mit zod geprüft — Schutz gegen einen künftig abweichenden DB-Stand
// (z. B. eine von Hand geänderte Zeile), den die Drizzle-Typen zur Laufzeit nicht mehr sehen.
const catalogStatusSchema = z.enum(["active", "inactive"]);

const modeSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
  status: catalogStatusSchema,
  isDefault: z.boolean(),
  isLivePresentation: z.boolean(),
  minBetMinor: z.number().int().nonnegative(),
  maxBetMinor: z.number().int().positive(),
}) satisfies z.ZodType<GameModeSummary>;

function toModeSummary(mode: GameModeRecord): GameModeSummary {
  const staticSource = findStaticGameById(mode.id);
  if (!staticSource) {
    throw new Error(`Modus „${mode.id}" existiert in der Datenbank, aber nicht mehr in data/games.ts.`);
  }
  return modeSummarySchema.parse({
    id: mode.id,
    slug: staticSource.slug,
    label: mode.label,
    status: mode.status,
    isDefault: mode.isDefault,
    isLivePresentation: mode.isLivePresentation,
    minBetMinor: mode.minBetMinor,
    maxBetMinor: mode.maxBetMinor,
  });
}

/**
 * 24 Modus-Kacheln für Lobby und Startseite (Auftrag §2: Lobby bleibt auf Modus-Granularität).
 * Kanonisch aus der Datenbank: `status`, `minDemoBetMinor`, `maxDemoBetMinor`. Alles andere
 * (Anzeige-Metadaten ohne Modus-genaue DB-Spalte) kommt aus data/games.ts, siehe Dateikommentar.
 */
export async function loadLobbyGames(db: AppDatabase): Promise<Game[]> {
  const gameModeRepo = new PgGameModeRepository(db);
  const modes = await gameModeRepo.findAll();

  const siblingsByGameId = new Map<string, GameModeRecord[]>();
  for (const mode of modes) {
    const list = siblingsByGameId.get(mode.gameId) ?? [];
    list.push(mode);
    siblingsByGameId.set(mode.gameId, list);
  }

  return modes.map((mode) => {
    const staticSource = findStaticGameById(mode.id);
    if (!staticSource) {
      throw new Error(`Modus „${mode.id}" existiert in der Datenbank, aber nicht mehr in data/games.ts.`);
    }
    const siblings = (siblingsByGameId.get(mode.gameId) ?? [])
      .filter((sibling) => sibling.id !== mode.id && sibling.status === "active")
      .map(toModeSummary);
    return {
      ...staticSource,
      status: mode.status,
      minDemoBetMinor: mode.minBetMinor,
      maxDemoBetMinor: mode.maxBetMinor,
      siblingModes: siblings.length > 0 ? siblings : undefined,
    };
  });
}

export type GameModeDetail = {
  title: GameTitleSummary;
  /** Der angeforderte Modus. */
  mode: GameModeSummary;
  /** Alle Modi des Titels inklusive des aktiven (Auftrag §3: inaktive werden markiert, nicht versteckt). */
  siblings: readonly GameModeSummary[];
};

/**
 * Lädt Titel- und Modus-Kontext für die Spieldetailseite (Auftrag §3): den angeforderten Modus
 * sowie alle Geschwistermodi desselben Titels für den Moduswechsel. `null`, wenn die ID keinem
 * `game_mode` entspricht (defensiv — bei einer über `data/games.ts` erreichbaren Route sollte
 * das dank server/seed/seed.test.ts nicht vorkommen).
 */
export async function loadGameModeDetail(db: AppDatabase, modeId: string): Promise<GameModeDetail | null> {
  const gameModeRepo = new PgGameModeRepository(db);
  const gameRepo = new PgGameRepository(db);

  const mode = await gameModeRepo.findById(modeId);
  if (!mode) return null;
  const title = await gameRepo.findById(mode.gameId);
  if (!title) return null;
  const siblingRecords = await gameModeRepo.findByGameId(mode.gameId);

  return {
    title: { id: title.id, name: title.name },
    mode: toModeSummary(mode),
    siblings: siblingRecords.map(toModeSummary),
  };
}

