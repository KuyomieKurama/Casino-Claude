import type { CreditsMinor } from "./money";

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
};

export type Provider = {
  id: string;
  name: string;
};
