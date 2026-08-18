import type { CreditsMinor } from "./money";
import type { GameModeSummary } from "./game-mode";

export type GameCategory =
  | "slots"
  | "roulette"
  | "blackjack"
  | "baccarat"
  | "poker"
  | "arcade"
  | "gameshow"
  | "live";

export type Volatility = "low" | "medium" | "high";

export type DemoDifficulty = "easy" | "medium" | "advanced";

export type Game = {
  id: string;
  slug: string;
  name: string;
  category: GameCategory;
  providerId: string;
  description: string;
  thumbnail: string;
  thumbnailAlt: string;
  banner?: string;
  tags: string[];
  demoDifficulty: DemoDifficulty;
  /** Nur gesetzt, wenn eine geprüfte Auszahlungstabelle in data/paytables.ts existiert. */
  rtpDemo?: number;
  volatility?: Volatility;
  minDemoBetMinor: CreditsMinor;
  maxDemoBetMinor: CreditsMinor;
  isNew: boolean;
  isPopular: boolean;
  isFeatured: boolean;
  isLiveDemo: boolean;
  status: "active" | "inactive";
  releasedAt: string;
  popularityScore: number;
  /**
   * Geschwistermodi desselben Titels (ohne diesen Modus selbst), nur gesetzt, wenn das Spiel
   * über die Repositories aus der Datenbank geladen wurde (server/catalog/read-model.ts).
   * Trägt den dezenten Lobby-Hinweis ("Auch als: Amerikanisch, Live") und die Modusauswahl auf
   * der Detailseite. `undefined`, wenn nur ein Modus existiert oder die Herkunft rein statisch ist.
   */
  siblingModes?: readonly GameModeSummary[];
};

export type Provider = {
  id: string;
  name: string;
};
