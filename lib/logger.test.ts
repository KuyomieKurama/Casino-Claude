import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, logger } from "./logger";

/**
 * Der Logger schreibt ausschließlich über `console.*` (einzige Senke laut Auftrag). Jeder Test
 * spiegelt genau diese Methode, statt echte Konsolenausgaben im Testlauf zu erzeugen.
 */
function spyOnConsole() {
  return {
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

describe("logger", () => {
  let spies: ReturnType<typeof spyOnConsole>;

  beforeEach(() => {
    spies = spyOnConsole();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("JSON-Form und Zeitstempel", () => {
    it("gibt eine einzelne Zeile gültiges JSON mit level, msg und time aus", () => {
      const fixedNow = () => new Date("2026-08-19T10:00:00.000Z");
      const log = createLogger({ now: fixedNow });

      log.info("Testereignis");

      expect(spies.info).toHaveBeenCalledTimes(1);
      const [line] = spies.info.mock.calls[0] as [string];
      expect(typeof line).toBe("string");
      expect(line.includes("\n")).toBe(false);

      const parsed = JSON.parse(line);
      expect(parsed).toMatchObject({ level: "info", msg: "Testereignis", time: "2026-08-19T10:00:00.000Z" });
    });

    it("bettet Kontextfelder flach auf oberster Ebene ein, statt sie zu verschachteln", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });

      log.warn("Ereignis mit Kontext", { route: "api/rounds/start", roundId: "round_123" });

      const [line] = spies.warn.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.route).toBe("api/rounds/start");
      expect(parsed.roundId).toBe("round_123");
      // Kontext darf die reservierten Felder nicht überschreiben.
      expect(parsed.level).toBe("warn");
    });

    it("nutzt ohne injizierte Zeitquelle die Systemzeit (vi.setSystemTime) im ISO-8601-Format", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-02T03:04:05.678Z"));
      const log = createLogger();

      log.error("Standardzeitquelle");

      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.time).toBe("2026-01-02T03:04:05.678Z");
    });

    it("reservierte Felder gewinnen, auch wenn der Kontext gleichnamige Schlüssel mitliefert", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });

      log.info("Kollisionstest", { level: "gefälscht", msg: "gefälscht", time: "gefälscht" });

      const [line] = spies.info.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.level).toBe("info");
      expect(parsed.msg).toBe("Kollisionstest");
      expect(parsed.time).toBe("2026-08-19T10:00:00.000Z");
    });
  });

  describe("Log-Level", () => {
    it("info() schreibt über console.info mit level=info", () => {
      const log = createLogger();
      log.info("a");
      expect(spies.info).toHaveBeenCalledTimes(1);
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).not.toHaveBeenCalled();
    });

    it("warn() schreibt über console.warn mit level=warn", () => {
      const log = createLogger();
      log.warn("a");
      const [line] = spies.warn.mock.calls[0] as [string];
      expect(JSON.parse(line).level).toBe("warn");
    });

    it("error() schreibt über console.error mit level=error", () => {
      const log = createLogger();
      log.error("a");
      const [line] = spies.error.mock.calls[0] as [string];
      expect(JSON.parse(line).level).toBe("error");
    });
  });

  describe("Fehlerserialisierung", () => {
    it("serialisiert ein Error-Objekt ohne Stack, wenn includeStack nicht gesetzt ist (sicherer Default)", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const error = new Error("etwas ist schiefgelaufen");

      log.error("Fehlgeschlagen", { error });

      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.error.name).toBe("Error");
      expect(parsed.error.message).toBe("etwas ist schiefgelaufen");
      expect(parsed.error.stack).toBeUndefined();
    });

    it("serialisiert ein Error-Objekt mit Stack, wenn includeStack=true (Nicht-Produktion)", () => {
      const log = createLogger({ includeStack: true, now: () => new Date("2026-08-19T10:00:00.000Z") });
      const error = new Error("etwas ist schiefgelaufen");

      log.error("Fehlgeschlagen", { error });

      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.error.name).toBe("Error");
      expect(parsed.error.message).toBe("etwas ist schiefgelaufen");
      expect(typeof parsed.error.stack).toBe("string");
      expect(parsed.error.stack.length).toBeGreaterThan(0);
    });

    it("gibt bei includeStack=true keinen Stack weiter, wenn keiner vorhanden ist", () => {
      const log = createLogger({ includeStack: true, now: () => new Date("2026-08-19T10:00:00.000Z") });
      const error = new Error("ohne Stack");
      error.stack = undefined;

      log.error("Fehlgeschlagen", { error });

      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.error.stack).toBeNull();
    });

    it("gibt unbekannte Zusatzfelder eines Error-Subtyps nicht weiter, weder mit noch ohne Stack", () => {
      class CustomError extends Error {
        geheim = "darf nicht ins Log";
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }
      const error = new CustomError("kaputt");

      const logWithStack = createLogger({ includeStack: true, now: () => new Date("2026-08-19T10:00:00.000Z") });
      logWithStack.error("a", { error });
      const parsedWithStack = JSON.parse(spies.error.mock.calls[0]![0] as string);
      expect(parsedWithStack.error.geheim).toBeUndefined();
      expect(parsedWithStack.error.name).toBe("CustomError");

      const logWithoutStack = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      logWithoutStack.error("a", { error });
      const parsedWithoutStack = JSON.parse(spies.error.mock.calls[1]![0] as string);
      expect(parsedWithoutStack.error.geheim).toBeUndefined();
    });

    it("serialisiert einen verschachtelten Error im Kontext (nicht nur direkt unter 'error')", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      log.error("a", { details: { cause: new Error("innen") } });
      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.details.cause.message).toBe("innen");
    });
  });

  describe("Datenbank-Abfragefehler (CRITICAL: SQL-Text und Parameterwerte dürfen nicht ins Log)", () => {
    it("ersetzt message bei name=DrizzleQueryError durch einen festen Text ohne Query und ohne Parameterwerte", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const error = new Error("Failed query: insert into wallet (amount, user_id) values ($1, $2)\nparams: 5000,user-1");
      error.name = "DrizzleQueryError";

      log.error("Rundenbuchung fehlgeschlagen", { route: "api/rg/self-exclusion", error });

      const [line] = spies.error.mock.calls[0] as [string];
      expect(line).not.toContain("insert into wallet");
      expect(line).not.toContain("5000");
      expect(line).not.toContain("user-1");
      const parsed = JSON.parse(line);
      // Der Fehlertyp bleibt erkennbar, nur die Nachricht wird ersetzt.
      expect(parsed.error.name).toBe("DrizzleQueryError");
      expect(parsed.error.message).not.toMatch(/insert into|params:/i);
    });

    it("erkennt einen Query-Fehler auch ohne passenden name, allein an eigenen query-/params-Feldern (reale drizzle-orm-Form)", () => {
      // node_modules/drizzle-orm/errors.js: DrizzleQueryError setzt this.name NIE, error.name
      // bleibt dort das geerbte "Error" — verifiziert per Testlauf gegen die installierte
      // Version. Die zuverlässige Signatur sind die eigenen Felder query/params.
      class RealisticQueryError extends Error {
        query: string;
        params: unknown[];
        constructor(query: string, params: unknown[]) {
          super(`Failed query: ${query}\nparams: ${params}`);
          this.query = query;
          this.params = params;
        }
      }
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const error = new RealisticQueryError("delete from sessions where token = $1", ["s3cr3t-session-token"]);

      log.error("Sitzungsbereinigung fehlgeschlagen", { error });

      const [line] = spies.error.mock.calls[0] as [string];
      expect(line).not.toContain("delete from sessions");
      expect(line).not.toContain("s3cr3t-session-token");
    });

    it("entfernt die geleakte Nachricht auch aus dem Stack, wenn includeStack aktiv ist", () => {
      const log = createLogger({ includeStack: true, now: () => new Date("2026-08-19T10:00:00.000Z") });
      const error = new Error("Failed query: select * from users where email = $1\nparams: opfer@example.com");
      error.name = "DrizzleQueryError";

      log.error("a", { error });

      const [line] = spies.error.mock.calls[0] as [string];
      expect(line).not.toContain("opfer@example.com");
      expect(line).not.toContain("select * from users");
    });

    it("übernimmt cause.name, aber cause.message nur, wenn sie erkennbar keinen Query-Text enthält", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });

      const causeWithQueryText = new Error("Failed query: select 1\nparams:");
      causeWithQueryText.name = "PostgresError";
      const errorWithUnsafeCause = new Error("Failed query: select 1\nparams:");
      errorWithUnsafeCause.name = "DrizzleQueryError";
      (errorWithUnsafeCause as Error & { cause?: unknown }).cause = causeWithQueryText;

      log.error("a", { error: errorWithUnsafeCause });
      const parsedUnsafe = JSON.parse(spies.error.mock.calls[0]![0] as string);
      expect(parsedUnsafe.error.cause.name).toBe("PostgresError");
      expect(parsedUnsafe.error.cause.message).toBeUndefined();

      const safeCause = new Error("Verbindung zur Datenbank verweigert");
      safeCause.name = "ConnectionError";
      const errorWithSafeCause = new Error("Failed query: select 1\nparams:");
      errorWithSafeCause.name = "DrizzleQueryError";
      (errorWithSafeCause as Error & { cause?: unknown }).cause = safeCause;

      log.error("b", { error: errorWithSafeCause });
      const parsedSafe = JSON.parse(spies.error.mock.calls[1]![0] as string);
      expect(parsedSafe.error.cause.name).toBe("ConnectionError");
      expect(parsedSafe.error.cause.message).toBe("Verbindung zur Datenbank verweigert");
    });
  });

  describe("Redaktion sensibler Schlüssel", () => {
    it("redigiert bekannte sensible Schlüssel unabhängig von Groß-/Kleinschreibung", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });

      log.warn("Anmeldeversuch", {
        password: "klartext123",
        Token: "abc",
        SECRET: "xyz",
        authorization: "Bearer abc",
        cookie: "sid=1",
        sessionToken: "sess_1",
        hash: "deadbeef",
        userId: "user_1",
      });

      const [line] = spies.warn.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.password).toBe("[redigiert]");
      expect(parsed.Token).toBe("[redigiert]");
      expect(parsed.SECRET).toBe("[redigiert]");
      expect(parsed.authorization).toBe("[redigiert]");
      expect(parsed.cookie).toBe("[redigiert]");
      expect(parsed.sessionToken).toBe("[redigiert]");
      expect(parsed.hash).toBe("[redigiert]");
      // Unbeteiligte Felder bleiben unverändert.
      expect(parsed.userId).toBe("user_1");
    });

    it("redigiert sensible Schlüssel auch verschachtelt (Objekte und Arrays)", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });

      // Container-Schlüssel "account" statt "credentials": "credentials" enthält selbst das
      // Fragment "credential" und würde deshalb komplett (nicht nur seine Blätter) redigiert
      // werden — siehe eigener Test unten. Hier geht es um Redaktion in der Tiefe, nicht um den
      // Container-Schlüssel selbst.
      log.error("verschachtelt", {
        user: { id: "user_1", account: { password: "geheim", nested: { token: "abc" } } },
        items: [{ secret: "eins" }, { secret: "zwei", ok: true }],
      });

      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.user.account.password).toBe("[redigiert]");
      expect(parsed.user.account.nested.token).toBe("[redigiert]");
      expect(parsed.user.id).toBe("user_1");
      expect(parsed.items[0].secret).toBe("[redigiert]");
      expect(parsed.items[1].secret).toBe("[redigiert]");
      expect(parsed.items[1].ok).toBe(true);
    });

    it("redigiert einen Container-Schlüssel wie 'credentials' vollständig (Fragment 'credential' trifft den Schlüssel selbst)", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });

      log.error("Container-Redaktion", { credentials: { password: "geheim", note: "unwichtig" } });

      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.credentials).toBe("[redigiert]");
    });

    it("redigiert Varianten wie accessToken, refreshToken, idToken, apiKey, clientSecret, privateKey, access_token und client_secret (Teilstring-Vergleich)", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });

      log.warn("OAuth-Antwort", {
        accessToken: "a",
        refreshToken: "b",
        idToken: "c",
        apiKey: "d",
        clientSecret: "e",
        privateKey: "f",
        access_token: "g",
        client_secret: "h",
        tokenCount: 3,
      });

      const [line] = spies.warn.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.accessToken).toBe("[redigiert]");
      expect(parsed.refreshToken).toBe("[redigiert]");
      expect(parsed.idToken).toBe("[redigiert]");
      expect(parsed.apiKey).toBe("[redigiert]");
      expect(parsed.clientSecret).toBe("[redigiert]");
      expect(parsed.privateKey).toBe("[redigiert]");
      expect(parsed.access_token).toBe("[redigiert]");
      expect(parsed.client_secret).toBe("[redigiert]");
      // Bewusst akzeptierter False Positive (siehe Kommentar bei SENSITIVE_KEY_FRAGMENTS in
      // logger.ts): ein harmloser Zähler mit "token" im Namen wird ebenfalls redigiert.
      expect(parsed.tokenCount).toBe("[redigiert]");
    });
  });

  describe("Map, Set und toJSON() (sonst stille Datenverluste)", () => {
    it("serialisiert eine Map erkennbar statt sie zu {} zu verkürzen, und redigiert sensible Schlüssel", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const map = new Map<string, unknown>([
        ["userId", "user_1"],
        ["password", "geheim"],
      ]);

      log.info("Map-Kontext", { map });

      const [line] = spies.info.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.map.__type).toBe("Map");
      expect(parsed.map.entries).toContainEqual(["userId", "user_1"]);
      expect(parsed.map.entries).toContainEqual(["password", "[redigiert]"]);
    });

    it("serialisiert ein Set erkennbar statt es zu {} zu verkürzen", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const set = new Set(["a", "b", "c"]);

      log.info("Set-Kontext", { set });

      const [line] = spies.info.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.set.__type).toBe("Set");
      expect(parsed.set.values).toEqual(["a", "b", "c"]);
    });

    it("wertet toJSON() aus, statt private Objektfelder als leeres Objekt zu loggen", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      class Money {
        #minor: number;
        constructor(minor: number) {
          this.#minor = minor;
        }
        toJSON() {
          return { minorUnits: this.#minor };
        }
      }
      const wallet = { balance: new Money(123456) };

      log.info("Wallet-Kontext", { wallet });

      const [line] = spies.info.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.wallet.balance.__toJSON).toEqual({ minorUnits: 123456 });
    });

    it("markiert eine fehlschlagende toJSON()-Auswertung, statt den Logger scheitern zu lassen", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const broken = {
        toJSON: () => {
          throw new Error("kaputt");
        },
      };

      expect(() => log.info("a", { broken })).not.toThrow();
      const [line] = spies.info.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.broken.__toJSON).toBe("[toJSON() ist fehlgeschlagen]");
    });
  });

  describe("Robustheit", () => {
    it("wirft nicht bei einer zyklischen Kontextstruktur und gibt stattdessen eine Ersatzzeile aus", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const cyclic: Record<string, unknown> = { name: "zirkulär" };
      cyclic.self = cyclic;

      expect(() => log.error("kaputter Kontext", { cyclic })).not.toThrow();

      expect(spies.error).toHaveBeenCalledTimes(1);
      const [line] = spies.error.mock.calls[0] as [string];
      expect(typeof line).toBe("string");
      const parsed = JSON.parse(line);
      expect(parsed.level).toBe("error");
      expect(parsed.msg).toBe("kaputter Kontext");
      expect(parsed.time).toBe("2026-08-19T10:00:00.000Z");
    });

    it("funktioniert weiterhin normal für nachfolgende Aufrufe, nachdem eine zyklische Struktur aufgetreten ist", () => {
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      log.error("kaputt", { cyclic });

      log.info("normal danach", { ok: true });
      const [line] = spies.info.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.msg).toBe("normal danach");
      expect(parsed.ok).toBe(true);
    });

    it("kommt ohne Kontext-Argument aus", () => {
      const log = createLogger();
      expect(() => log.info("ohne Kontext")).not.toThrow();
      const [line] = spies.info.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.msg).toBe("ohne Kontext");
    });

    it("wirft nicht, wenn die injizierte Zeitquelle selbst wirft, und liefert time: null", () => {
      const throwingNow = () => {
        throw new Error("Uhr kaputt");
      };
      const log = createLogger({ now: throwingNow });

      expect(() => log.info("a")).not.toThrow();
      const [line] = spies.info.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.time).toBeNull();
      expect(parsed.msg).toBe("a");
      expect(parsed.level).toBe("info");
    });

    it('wirft nicht bei einem ungültigen Date-Objekt (new Date("ungültig")) und liefert time: null', () => {
      const log = createLogger({ now: () => new Date("ungültig") });

      expect(() => log.warn("b")).not.toThrow();
      const [line] = spies.warn.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.time).toBeNull();
    });

    it("verwendet weiterhin eine gültige, vor dem Kontextfehler berechnete Zeit im zyklischen Fallback", () => {
      // Grenzfall zur Abgrenzung von den beiden Tests oben: Die Zeitquelle selbst ist hier
      // intakt, nur der Kontext ist zyklisch — dann bleibt die echte Zeit erhalten (siehe
      // bestehender Test "wirft nicht bei einer zyklischen Kontextstruktur" oben), NICHT null.
      const log = createLogger({ now: () => new Date("2026-08-19T10:00:00.000Z") });
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;

      log.error("kaputter Kontext, intakte Uhr", { cyclic });

      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.time).toBe("2026-08-19T10:00:00.000Z");
    });
  });

  describe("Standard-Logger (logger)", () => {
    it("ist mit dem sicheren Default (kein Stack) vorkonfiguriert", () => {
      const error = new Error("Standardfehler");
      logger.error("Standardlogger-Test", { error });
      const [line] = spies.error.mock.calls[0] as [string];
      const parsed = JSON.parse(line);
      expect(parsed.error.stack).toBeUndefined();
      expect(parsed.error.message).toBe("Standardfehler");
    });
  });
});
