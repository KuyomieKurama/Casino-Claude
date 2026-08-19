/**
 * Eigener, abhängigkeitsfreier JSON-Logger. `console` ist die einzige Ausgabe-Senke — kein
 * Transport, kein Datei-Schreiben (Auftrag „Strukturiertes Logging").
 *
 * Bewusst ohne `process.env`-Zugriff: Die ESLint-Schichtregel erlaubt `process.env`
 * ausschließlich in `lib/env.ts`, und `lib/**` darf nicht aus `server/` importieren — ein
 * direkter Import von `lib/env.ts` (das `server-only` importiert und beim Fehlen von
 * Pflichtvariablen wirft) würde diese Datei zudem im Browser unbrauchbar machen
 * (components/feedback/AsyncBoundary.tsx läuft dort). Umgebungsabhängiges Verhalten (aktuell:
 * ob ein Stacktrace geloggt wird) wird deshalb über `LoggerOptions` als Parameter hereingereicht.
 * Server-seitige Aufrufer lesen den bereits validierten Wert aus `lib/env.ts` und geben ihn beim
 * Erzeugen einer eigenen Logger-Instanz weiter; ohne diese Angabe gilt der sichere Default
 * (kein Stacktrace).
 */

export type LogLevel = "info" | "warn" | "error";

/** Flacher Zusatzkontext, z. B. { route, roundId, error }. Werte sind absichtlich `unknown`,
 * damit nichts Externes (Catch-Fehler, Request-Daten) ungeprüft als `any` durchgereicht wird. */
export type LogContext = Record<string, unknown>;

export interface LoggerOptions {
  /**
   * Ob Error-Objekte im Kontext mit vollem Stacktrace geloggt werden. Default `false`: ein
   * Stacktrace legt Dateipfade und interne Struktur offen, deshalb ist „kein Stack" der sichere
   * Wert für jeden Aufrufer, der die Umgebung nicht selbst prüfen kann.
   */
  includeStack?: boolean;
  /** Zeitquelle, austauschbar für deterministische Tests. Default: `() => new Date()`. */
  now?: () => Date;
}

export interface Logger {
  /**
   * @param msg Fester, literaler Text ohne variable oder personenbezogene Daten. `msg` durchläuft
   *   KEINE Redaktion (siehe `sanitize()`/`SENSITIVE_KEY_FRAGMENTS` unten) — nur `context` wird
   *   rekursiv geprüft und redigiert. Variable Werte (IDs, Nutzereingaben, Fehlerobjekte, …)
   *   gehören deshalb ausschließlich in `context`, niemals interpoliert in `msg`.
   */
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext): void;
}

const REDACTED_VALUE = "[redigiert]";

/**
 * Textbausteine, deren Auftreten in einem (kleingeschriebenen, von `_`/`-` bereinigten)
 * Schlüsselnamen den zugehörigen Wert redigiert. Bewusst als Teilstring-Suche (nicht mehr als
 * exakter Namensvergleich): Ein exakter Vergleich hat Varianten wie `accessToken`,
 * `refreshToken`, `client_secret` oder `apiKey` verfehlt, weil deren Schlüssel nie exakt
 * `"token"`/`"secret"`/`"apikey"` lauten. Die Kehrseite ist, dass ein harmloser Schlüssel wie
 * `tokenCount` jetzt ebenfalls redigiert wird — im Sicherheitskontext eines Logs ist ein
 * fälschlich redigierter Zähler das kleinere Übel gegenüber einem tatsächlich geleakten
 * Secret, deshalb bleibt der Teilstring-Vergleich hier bewusst bestehen.
 */
const SENSITIVE_KEY_FRAGMENTS = ["password", "passwd", "token", "secret", "credential", "cookie", "hash", "apikey", "privatekey", "authorization"];

/** Normalisiert einen Schlüssel für den Redaktions-Vergleich: kleingeschrieben, ohne `_`/`-`,
 * damit `client_secret`, `client-secret` und `clientSecret` gleich behandelt werden. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function isPlainObject(value: unknown): value is LogContext {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error) &&
    !(value instanceof Date) &&
    !(value instanceof Map) &&
    !(value instanceof Set)
  );
}

/**
 * Fester deutscher Ersatztext für Datenbank-Abfragefehler. Ersetzt `error.message`, wenn
 * `isQueryError()` zuschlägt (siehe dort) — niemals der ursprüngliche Text.
 */
const QUERY_ERROR_MESSAGE = "Datenbankabfrage fehlgeschlagen. SQL-Text und gebundene Parameterwerte werden aus Sicherheitsgründen nicht geloggt.";

/**
 * Erkennt Datenbank-Abfragefehler robust per Duck-Typing, nicht nur per `instanceof
 * DrizzleQueryError` — ein `instanceof`-Test wäre an einen direkten `drizzle-orm`-Import aus
 * `lib/**` gebunden, was die Schichtregel verletzen würde (`lib/` bleibt rein und framework-frei).
 *
 * Zwei unabhängige Signale, weil sich `drizzle-orm` in der Praxis nicht auf `error.name` verlassen
 * lässt: `DrizzleQueryError` (node_modules/drizzle-orm/errors.js) setzt `this.name` an keiner
 * Stelle selbst, `error.name` bleibt also das geerbte `"Error"` — verifiziert per Testlauf gegen
 * die installierte Version. Die zuverlässige Signatur sind die EIGENEN Felder `query` und
 * `params`, die der Konstruktor direkt auf die Instanz schreibt. Der Name-Vergleich bleibt
 * zusätzlich bestehen (zukunftssicher, falls eine spätere `drizzle-orm`-Version `name` setzt, und
 * deckt handgebaute Fehler in Tests ab, die den Namen explizit setzen).
 */
function isQueryError(error: Error): boolean {
  return error.name === "DrizzleQueryError" || Object.hasOwn(error, "query") || Object.hasOwn(error, "params");
}

/**
 * Eine `cause`-Nachricht ist nur dann sicher genug für das Log, wenn sie nachweislich keinen
 * SQL-Text und keine Parameterwerte trägt. Das lässt sich aus einer freien Textnachricht nie
 * beweisen, deshalb ist die Prüfung bewusst konservativ (Positivliste unauffälliger Wörter
 * scheidet aus, da beliebige Datenbank-Fehlermeldungen beliebigen Text enthalten können) — jede
 * Nachricht, die auch nur entfernt nach einer Abfrage aussieht, gilt als unsicher und wird
 * unterdrückt. Im Zweifel gewinnt Datenschutz vor Diagnosekomfort, wie im Auftrag gefordert.
 */
function isCauseMessageSafe(message: string): boolean {
  const suspiciousMarkers = /(query|params?|select|insert|update|delete|drop|sql|failed)/i;
  return !suspiciousMarkers.test(message);
}

/**
 * Baut die serialisierte Form eines Query-Fehlers: `message` ist immer der feste Ersatztext,
 * `stack` (falls überhaupt geloggt) wird von der Original-Nachricht befreit — Node baut
 * `error.stack` typischerweise als `"${name}: ${message}\n${frames}"`, ein roher Stack würde die
 * geleakte Nachricht also über einen Umweg zurückholen. `cause.name` darf laut Auftrag immer
 * übernommen werden (bloßer Fehlertyp, kein Freitext), `cause.message` nur nach bestandener
 * `isCauseMessageSafe()`-Prüfung.
 */
function serializeQueryError(error: Error, includeStack: boolean): LogContext {
  const base: LogContext = { name: error.name, message: QUERY_ERROR_MESSAGE };

  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeInfo: LogContext = { name: cause.name };
    if (isCauseMessageSafe(cause.message)) {
      causeInfo.message = cause.message;
    }
    base.cause = causeInfo;
  }

  if (!includeStack) return base;
  const sanitizedStack = error.stack ? error.stack.replaceAll(error.message, QUERY_ERROR_MESSAGE) : null;
  return { ...base, stack: sanitizedStack };
}

/**
 * Wandelt ein Error-Objekt in eine schmale, bewusst begrenzte Form um: nur `name`, `message` und
 * — außerhalb der Produktion — `stack`. Eigene Zusatzfelder eines Error-Subtyps (z. B. ein an
 * einen Fehler gehängtes Request- oder Zugangsdaten-Objekt) werden NICHT übernommen, damit
 * darüber nichts Unerwartetes ins Log gelangt (Anforderung: keine Weitergabe unbekannter
 * Fehlerfelder). In Produktion bleibt der Stack zusätzlich ganz weg, weil er Dateipfade und
 * interne Struktur der Anwendung offenlegt — Informationen, die ein Angreifer sonst nur durch
 * eigene Fehlerprovokation erhalten würde.
 *
 * Datenbank-Abfragefehler (`isQueryError()`) sind ein Sonderfall: Ihre `message` trägt bei
 * `drizzle-orm` den vollständigen SQL-Text samt gebundener Parameterwerte
 * (node_modules/drizzle-orm/errors.js: `Failed query: ${query}\nparams: ${params}`) — das wird
 * hier durch `serializeQueryError()` abgefangen, BEVOR die Nachricht irgendwo in die Ausgabe
 * gelangen kann.
 */
function serializeError(error: Error, includeStack: boolean): LogContext {
  if (isQueryError(error)) return serializeQueryError(error, includeStack);
  const base: LogContext = { name: error.name, message: error.message };
  return includeStack ? { ...base, stack: error.stack ?? null } : base;
}

/** Serialisiert eine `Map`: Object.entries() (siehe `sanitize()`) liefert für Map/Set-Instanzen
 * ein leeres Objekt, weil deren Inhalt nicht als eigene, aufzählbare Objekt-Properties vorliegt —
 * ohne diese Sonderbehandlung verschwindet der gesamte Inhalt lautlos aus dem Log. `__type`
 * macht die Herkunft im JSON erkennbar, Schlüssel und Werte durchlaufen dieselbe Redaktion wie
 * bei einem gewöhnlichen Objekt (ein String-Schlüssel wie `"password"` redigiert seinen Wert). */
function sanitizeMap(value: Map<unknown, unknown>, includeStack: boolean): LogContext {
  const entries = Array.from(value.entries(), ([key, val]) => {
    const sanitizedValue = typeof key === "string" && isSensitiveKey(key) ? REDACTED_VALUE : sanitize(val, includeStack);
    return [sanitize(key, includeStack), sanitizedValue];
  });
  return { __type: "Map", entries };
}

/** Serialisiert ein `Set` — gleiche Begründung wie `sanitizeMap()`. */
function sanitizeSet(value: Set<unknown>, includeStack: boolean): LogContext {
  return { __type: "Set", values: Array.from(value, (item) => sanitize(item, includeStack)) };
}

/**
 * Wertet die `toJSON()`-Methode eines Objekts aus, statt sie stillschweigend zu ignorieren.
 * `Object.entries()` (siehe `sanitize()`) liest nur eigene, aufzählbare Properties — ein Objekt,
 * dessen eigentlicher Zustand privat ist und nur über `toJSON()` eine sinnvolle Darstellung
 * liefert (üblich bei Wrapper-/Value-Objekten), würde sonst als `{}` oder als unvollständiges
 * Objekt geloggt und der eigentliche Inhalt lautlos verloren gehen. Das Ergebnis wird rekursiv
 * durch `sanitize()` geschickt (deckt z. B. ein `toJSON()` ab, das selbst sensible Schlüssel
 * zurückgibt) und unter `__toJSON` einsortiert, damit im Log erkennbar bleibt, dass die
 * Darstellung von `toJSON()` stammt und nicht von den eigenen Properties. Wirft `toJSON()`
 * selbst, wird das ausdrücklich vermerkt statt den Fehler zu propagieren (der Logger darf nie
 * werfen).
 */
function sanitizeViaToJSON(toJSON: () => unknown, includeStack: boolean): LogContext {
  try {
    return { __toJSON: sanitize(toJSON(), includeStack) };
  } catch {
    return { __toJSON: "[toJSON() ist fehlgeschlagen]" };
  }
}

/**
 * Läuft rekursiv durch einen Kontextwert: redigiert sensible Schlüssel und wandelt Error/Date/
 * Map/Set/toJSON-fähige Objekte in eine loggbare Form um. Bei einer zyklischen Struktur läuft
 * diese Funktion in eine tiefe Rekursion und wirft irgendwann selbst (Maximum call stack size
 * exceeded) — das ist beabsichtigt, denn `buildLine()` fängt genau das ab und liefert eine
 * sichere Ersatzzeile (Anforderung: der Logger darf nie werfen).
 */
function sanitize(value: unknown, includeStack: boolean): unknown {
  if (value instanceof Error) return serializeError(value, includeStack);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return sanitizeMap(value, includeStack);
  if (value instanceof Set) return sanitizeSet(value, includeStack);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, includeStack));
  if (isPlainObject(value)) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") {
      return sanitizeViaToJSON(toJSON.bind(value), includeStack);
    }
    const result: LogContext = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? REDACTED_VALUE : sanitize(val, includeStack);
    }
    return result;
  }
  return value;
}

function buildLine(level: LogLevel, msg: string, context: LogContext | undefined, includeStack: boolean, now: () => Date): string {
  // Eigener, geschützter Block NUR für die Zeitquelle: `now()` ist von außen injizierbar
  // (Testbarkeit) und kann ebenso wie eine ungültige Zeit (`new Date("ungültig").toISOString()`
  // wirft `RangeError: Invalid time value`) werfen. Ohne diesen eigenen try bräche eine defekte
  // Zeitquelle den zugesicherten Vertrag „der Logger wirft nie" schon vor dem eigentlichen
  // Logging-Versuch. Ein Fehlschlag hier bedeutet zwangsläufig `time: null` — anders als beim
  // Kontext (siehe unten) gibt es keinen sinnvollen Ersatzwert für eine Zeit, die sich nicht
  // ermitteln ließ.
  let time: string | null;
  try {
    time = now().toISOString();
  } catch {
    time = null;
  }

  try {
    const sanitizedContext = context ? (sanitize(context, includeStack) as LogContext) : {};
    // Reservierte Felder zuletzt gesetzt, damit ein Kontext mit gleichnamigem Schlüssel (etwa
    // versehentlich { level: ... } im Kontext) sie nicht überschreiben kann.
    return JSON.stringify({ ...sanitizedContext, level, msg, time });
  } catch {
    // Serialisierung schlägt z. B. bei einer zyklischen Struktur im Kontext fehl (Rekursion in
    // sanitize() oder JSON.stringify() selbst). Der Logger darf dadurch nie den Aufrufer stören
    // — die Ersatzzeile enthält weiterhin level/msg/time (time steht zu diesem Zeitpunkt bereits
    // fest, siehe oben), nur der Kontext entfällt.
    return JSON.stringify({ level, msg, time, hinweis: "Kontext konnte nicht serialisiert werden (z. B. zyklische Struktur)." });
  }
}

/** Baut eine neue Logger-Instanz mit den gegebenen Optionen. Mehrere Instanzen sind unabhängig
 * konfigurierbar (z. B. `includeStack` je nach Umgebung) — es gibt bewusst keinen globalen,
 * mutierbaren Konfigurationszustand. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const includeStack = options.includeStack ?? false;
  const now = options.now ?? (() => new Date());

  function log(level: LogLevel, msg: string, context?: LogContext): void {
    const line = buildLine(level, msg, context, includeStack, now);
    // console ist die einzige Senke (kein Transport, kein Datei-Schreiben, siehe Auftrag).
    console[level](line);
  }

  return {
    info: (msg, context) => log("info", msg, context),
    warn: (msg, context) => log("warn", msg, context),
    error: (msg, context) => log("error", msg, context),
  };
}

/** Vorkonfigurierte Instanz mit sicherem Default (kein Stacktrace) — für Aufrufer, die die
 * Umgebung nicht selbst prüfen können, allen voran Client-Code wie AsyncBoundary.tsx. */
export const logger: Logger = createLogger();
