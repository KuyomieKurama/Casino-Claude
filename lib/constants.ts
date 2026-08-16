import type { CreditsMinor } from "@/types/money";

/** Produktname — genau eine Stelle. Hier ändern, überall wirksam. */
export const PRODUCT_NAME = "Velora Casino Demo";

/** Kurzform für enge Stellen (Header auf Mobil, Bottom-Nav). */
export const PRODUCT_SHORT_NAME = PRODUCT_NAME.replace(/\s*Casino Demo$/, "");

export const STORAGE_KEY = "velora.demo.v1";
export const SCHEMA_VERSION = 1;

/** Startguthaben 1.000,00 Credits (§8.6). */
export const START_BALANCE_MINOR: CreditsMinor = 100_000;
export const TOP_UP_OPTIONS_MINOR: readonly CreditsMinor[] = [10_000, 50_000];

/** Obergrenze für das Demo-Guthaben, damit Anzeige und Formatierung stabil bleiben. */
export const MAX_BALANCE_MINOR: CreditsMinor = 99_999_999_99;

export const DEFAULT_REMINDER_INTERVAL_MINUTES = 30;
export const PAUSE_OPTIONS_MINUTES: readonly number[] = [15, 60, 24 * 60];
export const SESSION_LIMIT_OPTIONS_MINUTES: readonly number[] = [15, 30, 60, 120];

export const SEARCH_DEBOUNCE_MS = 200;
export const LOBBY_PAGE_SIZE = 12;

/** Simulierte Ladezeit eines Spiels und Dauer einer Runde. */
export const GAME_LOAD_MS = 700;
export const ROUND_DURATION_MS = 1400;

/** Kontexthinweise (Demo-Kennzeichnung Ebene 3, §8.5). */
export const DEMO_STRIPE_TEXT = "Demo-Prototyp — kein Echtgeldspiel, keine Auszahlungen";
export const DEMO_ACCOUNT_HINT = "Dies ist ein Demo-Konto. Es werden keine Echtgeld- oder Identitätsdaten benötigt.";
export const PASSWORD_HINT = "Dieses Passwort wird nicht gespeichert. Bitte trotzdem kein echtes verwenden.";
export const RG_NOTICE =
  "Bitte spiele verantwortungsvoll. Dieser Prototyp verwendet kein Echtgeld. Bei einem realen Glücksspielangebot wären Altersprüfung, Limits, Selbstsperre, KYC und weitere Schutzmaßnahmen erforderlich.";
export const INSUFFICIENT_BALANCE_TEXT =
  "Dein Demo-Guthaben reicht für diese Runde nicht aus. Setze es zurück oder füge Demo-Credits hinzu.";
export const HERO_TEXT = `Spiele kostenlos im Demo-Modus und entdecke die ${PRODUCT_SHORT_NAME} Casino Experience.`;
