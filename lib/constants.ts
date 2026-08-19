import type { CreditsMinor } from "@/types/money";

/** Produktname — genau eine Stelle. Hier ändern, überall wirksam. */
export const PRODUCT_NAME = "Velora Casino";

/** Kurzform für enge Stellen (Header auf Mobil, Bottom-Nav). */
export const PRODUCT_SHORT_NAME = PRODUCT_NAME.replace(/\s*Casino$/, "");

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
 *
 * Bewusst OHNE weitere Anhebung: die neue Scheibe "soundPrefs" (Auftrag „Klang-Infrastruktur",
 * lib/storage.ts::SliceKey) kam rein additiv hinzu — ein bestehender Envelope ohne dieses Feld
 * wird von loadPersisted() einfach nicht befüllt, components/sound/sound-store.ts fällt dann auf
 * den dokumentierten Default ("aus") zurück. Es gibt hier nichts, das falsch interpretiert werden
 * könnte (anders als bei 2–4 oben, wo eine ENTFERNTE oder in ihrer FORM geänderte Scheibe sonst
 * stillschweigend fehlinterpretiert worden wäre). Eine Anhebung würde stattdessen nur unnötig
 * das Guthaben, die Favoriten und alle anderen bereits gespeicherten Daten jedes Bestandsnutzers
 * verwerfen — nur für eine neue, unabhängige Einstellung.
 */
export const SCHEMA_VERSION = 4;

/** Startguthaben 10.000,00 Credits, einmalig als erste Ledger-Buchung bei Wallet-Anlage (§8.6). */
export const START_BALANCE_MINOR: CreditsMinor = 1_000_000;
export const TOP_UP_OPTIONS_MINOR: readonly CreditsMinor[] = [10_000, 50_000];

/** Obergrenze für das Guthaben, damit Anzeige und Formatierung stabil bleiben. */
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

/** Künstliche Ladezeit eines Spiels und Dauer einer Runde (Oberflächen-Timing, kein Netzwerkwert). */
export const GAME_LOAD_MS = 700;
export const ROUND_DURATION_MS = 1400;

/**
 * Kontexthinweise rund um Konto, Guthaben und Responsible Gaming. Credits sind durchgängig als
 * Spielwährung ohne Geldwert gekennzeichnet — nicht als auffälliges Banner auf jeder Seite,
 * sondern an den Stellen, an denen es inhaltlich zählt: Fußzeile, Registrierung, Hilfe/FAQ.
 */
export const CURRENCY_NOTICE = "Credits sind eine Spielwährung ohne Geldwert. Sie lassen sich weder einzahlen noch auszahlen.";
export const ACCOUNT_CURRENCY_HINT = "Für die Anmeldung werden keine Zahlungs- oder Identitätsdaten benötigt. Credits sind eine Spielwährung ohne Geldwert.";
export const PASSWORD_HINT = "Wird gehasht gespeichert, nie im Klartext.";
export const RG_NOTICE =
  "Bitte spiele verantwortungsvoll. Diese Anwendung verwendet ausschließlich Credits als Spielwährung ohne Geldwert, kein Echtgeld. Bei einem realen Glücksspielangebot wären Altersprüfung, Limits, Selbstsperre, KYC und weitere Schutzmaßnahmen erforderlich.";
export const INSUFFICIENT_BALANCE_TEXT = "Dein Guthaben reicht für diese Runde nicht aus. Setze es zurück oder füge Credits hinzu.";
export const HERO_TEXT = `Spiele mit Spielwährung und entdecke die ${PRODUCT_SHORT_NAME} Casino Experience.`;
