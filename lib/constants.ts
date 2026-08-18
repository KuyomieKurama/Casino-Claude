import type { CreditsMinor } from "@/types/money";

/** Produktname — genau eine Stelle. Hier ändern, überall wirksam. */
export const PRODUCT_NAME = "Velora Casino Demo";

/** Kurzform für enge Stellen (Header auf Mobil, Bottom-Nav). */
export const PRODUCT_SHORT_NAME = PRODUCT_NAME.replace(/\s*Casino Demo$/, "");

export const STORAGE_KEY = "velora.demo.v1";
/**
 * 2: die Scheiben "session" und "admin" entfielen mit der serverseitigen Authentifizierung
 * (Auftrag §4) — Sitzung und Rolle kommen jetzt vom Server, nicht mehr aus LocalStorage. Alte
 * Daten mit schemaVersion 1 (inklusive dieser beiden Scheiben) laufen dadurch beim nächsten
 * Laden in den bereits vorhandenen "unsupported-version"-Pfad (lib/storage.ts) und werden
 * verworfen statt fehlinterpretiert — siehe lib/storage.test.ts.
 *
 * 3: das Feld "pendingRound" entfiel aus der "wallet"-Scheibe (state/wallet-reducer.ts::
 * toPersistedWallet) — der lokale Rundenpfad (START_ROUND/SETTLE_ROUND/RAISE_ROUND_STAKE) wurde
 * entfernt, seit Phase 3b laufen alle Runden serverseitig. Ein alter LocalStorage-Eintrag mit
 * einer noch offenen "pendingRound" würde ohne diese Anhebung stillschweigend ignoriert
 * (das Feld existiert im neuen Typ schlicht nicht mehr) statt sauber verworfen zu werden.
 *
 * 4: die Scheibe "rg" entfiel vollständig (state/RgContext.tsx, Auftrag „Server statt Client") —
 * Selbstsperre, Pause und Zeitlimit leben jetzt ausschließlich in der Datenbank (`rg_setting`,
 * `play_session`, server/db/schema.ts) und werden serverseitig durchgesetzt, nicht mehr nur
 * angezeigt. Eine alte, lokal gesetzte Selbstsperre in "rg" würde ohne diese Anhebung
 * stillschweigend verworfen (nie in die Datenbank übernommen) UND der Nutzer stillschweigend
 * entsperrt wirken — genau das verhindert der "unsupported-version"-Pfad (lib/storage.ts): alte
 * Daten werden sichtbar verworfen, nicht geraten. Eine echte Migration nach Postgres gibt es
 * nicht (siehe Bericht); wer sich vor dieser Umstellung nur lokal gesperrt hatte, muss die Sperre
 * nach dem Update im neuen, serverseitigen Bereich erneut gezielt setzen.
 */
export const SCHEMA_VERSION = 4;

/** Startguthaben 1.000,00 Credits (§8.6). */
export const START_BALANCE_MINOR: CreditsMinor = 100_000;
export const TOP_UP_OPTIONS_MINOR: readonly CreditsMinor[] = [10_000, 50_000];

/** Obergrenze für das Demo-Guthaben, damit Anzeige und Formatierung stabil bleiben. */
export const MAX_BALANCE_MINOR: CreditsMinor = 99_999_999_99;

export const DEFAULT_REMINDER_INTERVAL_MINUTES = 30;
export const PAUSE_OPTIONS_MINUTES: readonly number[] = [15, 60, 24 * 60];
export const SESSION_LIMIT_OPTIONS_MINUTES: readonly number[] = [15, 30, 60, 120];

/**
 * Zeitfenster, innerhalb dessen ein `requestLift` (server/rg/rg-settings-service.ts) durch ein
 * anschließendes, GESONDERTES `confirmLift` bestätigt werden muss — sonst verfällt die Anfrage.
 * Erzwingt serverseitig, was der Zwei-Schritt-Dialog (components/rg/LimitDialog.tsx) an der
 * Oberfläche zeigt: eine Selbstsperre lässt sich nicht mit einem einzelnen Aufruf aufheben, auch
 * nicht per direktem API-Aufruf unter Umgehung der Oberfläche.
 */
export const RG_LIFT_CONFIRM_WINDOW_MS = 10 * 60_000;

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
