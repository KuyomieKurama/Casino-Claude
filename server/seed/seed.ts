import { findGameById } from "@/data/games";
import { providers } from "@/data/providers";
import type { AppDatabase } from "@/server/db/types";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { PgGameRepository } from "@/server/repositories/game-repository";
import { PgProviderRepository } from "@/server/repositories/provider-repository";
import type { GameModeUpsertInput, GameUpsertInput } from "@/server/repositories/types";
import { paytableKeyFor, TITLES, type TitleDefinition } from "./grouping";

/**
 * Befüllt `provider`, `game` und `game_mode` aus den bestehenden Code-Daten
 * (`data/providers.ts`, `data/games.ts`) und der Gruppierung in `./grouping.ts`.
 *
 * Idempotent durch Upsert auf der Primärschlüssel-ID: ein zweiter Lauf verändert die Zeilenzahl
 * nicht (siehe server/seed/seed.test.ts). Nimmt eine bereits verbundene `AppDatabase` entgegen,
 * statt sich selbst zu verbinden — dieselbe Funktion läuft damit unverändert gegen PGlite in
 * Tests und gegen die echte Datenbank in `run-seed.ts`.
 */
export interface SeedResult {
  providerCount: number;
  gameCount: number;
  gameModeCount: number;
}

export async function seedCatalog(db: AppDatabase): Promise<SeedResult> {
  const providerRepo = new PgProviderRepository(db);
  const gameRepo = new PgGameRepository(db);
  const gameModeRepo = new PgGameModeRepository(db);

  for (const p of providers) {
    await providerRepo.upsert({ id: p.id, name: p.name });
  }

  let gameModeCount = 0;
  for (const [titleIndex, title] of TITLES.entries()) {
    await gameRepo.upsert(buildGameInput(title, titleIndex));
    for (const modeInput of buildGameModeInputs(title)) {
      await gameModeRepo.upsert(modeInput);
      gameModeCount += 1;
    }
  }

  return { providerCount: providers.length, gameCount: TITLES.length, gameModeCount };
}

/** Titel-Felder: bei einem Modus direkt aus data/games.ts, sonst vom Standardmodus abgeleitet. */
function buildGameInput(title: TitleDefinition, sortOrder: number): GameUpsertInput {
  const defaultMode = title.modes.find((m) => m.isDefault) ?? title.modes[0];
  if (!defaultMode) throw new Error(`Seed-Gruppierung: Titel „${title.id}" hat keinen Modus.`);
  const source = findGameById(defaultMode.id);
  if (!source) throw new Error(`Seed: „${defaultMode.id}" existiert nicht mehr in data/games.ts.`);
  return {
    id: title.id,
    slug: title.slug,
    name: title.name ?? source.name,
    category: source.category,
    providerId: source.providerId,
    description: source.description,
    status: source.status,
    isFeatured: source.isFeatured,
    isNew: source.isNew,
    isPopular: source.isPopular,
    releasedAt: normalizeReleasedAt(source.releasedAt),
    popularityScore: source.popularityScore,
    sortOrder,
  };
}

function buildGameModeInputs(title: TitleDefinition): GameModeUpsertInput[] {
  return title.modes.map((mode, sortOrder) => {
    const source = findGameById(mode.id);
    if (!source) throw new Error(`Seed: „${mode.id}" existiert nicht mehr in data/games.ts.`);
    return {
      id: mode.id,
      gameId: title.id,
      key: mode.key,
      label: mode.label,
      kind: mode.kind,
      engineKey: mode.engineKey,
      paytableKey: paytableKeyFor(mode.id),
      minBetMinor: source.minDemoBetMinor,
      maxBetMinor: source.maxDemoBetMinor,
      isLivePresentation: mode.isLivePresentation,
      isDefault: mode.isDefault,
      sortOrder,
      status: source.status,
    };
  });
}

/**
 * data/games.ts speichert reine Datumswerte ("2025-09-12"), die Spalte ist aber `timestamptz`.
 * Explizit Mitternacht UTC anhängen statt Postgres raten zu lassen (session-abhängige
 * Zeitzonen-Interpretation eines bloßen Datums) — deterministisch in jeder Umgebung.
 */
function normalizeReleasedAt(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}
