import type { EngineKey, GameModeKind } from "@/server/db/enums";
import type { GameCategory } from "@/types/game";
import type { CreditsMinor } from "@/types/money";

/**
 * Domänentypen der Katalog-Repositories.
 *
 * Bewusst getrennt von den Drizzle-Tabellen in `server/db/schema.ts`: Kein Drizzle-Typ
 * (Spaltenbuilder, InferSelectModel o. Ä.) soll `server/db/` verlassen — der Rest der
 * Anwendung kennt nur diese Interfaces und die bestehenden Domänentypen aus `types/`.
 *
 * Auch bewusst getrennt von `types/game.ts`: Das dortige `Game` ist das heutige
 * CLIENTSEITIGE Flachmodell (ein Eintrag je Spiel-ID inkl. Anzeige-Feldern wie Thumbnail,
 * Tags, Volatilität) und entspricht nicht 1:1 dem neuen Titel/Modus-Modell der Datenbank —
 * `GameRecord`/`GameModeRecord` bilden nur die Spalten ab, die in dieser Phase angelegt werden.
 */

export type CatalogStatus = "active" | "inactive";

export interface ProviderRecord {
  id: string;
  name: string;
}

export type ProviderUpsertInput = ProviderRecord;

export interface GameRecord {
  id: string;
  slug: string;
  name: string;
  category: GameCategory;
  providerId: string;
  description: string;
  status: CatalogStatus;
  isFeatured: boolean;
  isNew: boolean;
  isPopular: boolean;
  /** ISO-8601-Zeitstempel (timestamptz in der DB). */
  releasedAt: string;
  popularityScore: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type GameUpsertInput = Omit<GameRecord, "createdAt" | "updatedAt">;

export interface GameModeRecord {
  /** = heutige Game.id aus data/games.ts, siehe server/db/schema.ts. */
  id: string;
  gameId: string;
  key: string;
  label: string;
  kind: GameModeKind;
  engineKey: EngineKey;
  /** Schlüssel in data/paytables/index.ts, oder null ohne dokumentierte Tabelle. */
  paytableKey: string | null;
  minBetMinor: CreditsMinor;
  maxBetMinor: CreditsMinor;
  isLivePresentation: boolean;
  isDefault: boolean;
  sortOrder: number;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
}

export type GameModeUpsertInput = Omit<GameModeRecord, "createdAt" | "updatedAt">;

export interface ProviderRepository {
  findAll(): Promise<ProviderRecord[]>;
  findById(id: string): Promise<ProviderRecord | null>;
  /** Einfügen oder Aktualisieren anhand der ID — macht den Seed wiederholbar. */
  upsert(input: ProviderUpsertInput): Promise<ProviderRecord>;
}

export interface GameRepository {
  findAll(): Promise<GameRecord[]>;
  findById(id: string): Promise<GameRecord | null>;
  findBySlug(slug: string): Promise<GameRecord | null>;
  upsert(input: GameUpsertInput): Promise<GameRecord>;
}

export interface GameModeRepository {
  findAll(): Promise<GameModeRecord[]>;
  findById(id: string): Promise<GameModeRecord | null>;
  findByGameId(gameId: string): Promise<GameModeRecord[]>;
  upsert(input: GameModeUpsertInput): Promise<GameModeRecord>;
}
