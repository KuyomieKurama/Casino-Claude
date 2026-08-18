import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * `server-only` wirft beim Import immer eine Exception, außer ein Bundler löst sie über die
 * "react-server"-Bedingung auf (das übernimmt bei Next.js ein eigener Webpack-Loader für den
 * Server-Layer). Vitest/Vite durchläuft diesen Loader nicht — ohne diesen Mock würde jeder
 * Import von lib/env.ts hier sofort abbrechen, unabhängig vom eigentlichen Testinhalt.
 */
vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("lib/env", () => {
  test("gültige Konfiguration wird akzeptiert", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";

    const { env } = await import("./env");

    expect(env.DATABASE_URL).toBe("postgresql://user:passwort@localhost:5432/velora");
  });

  test("akzeptiert auch das Kurzprotokoll postgres://", async () => {
    process.env.DATABASE_URL = "postgres://user:passwort@localhost:5432/velora";

    const { env } = await import("./env");

    expect(env.DATABASE_URL).toBe("postgres://user:passwort@localhost:5432/velora");
  });

  test("fehlende DATABASE_URL bricht den Prozess ab und benennt die Variable", async () => {
    delete process.env.DATABASE_URL;

    await expect(import("./env")).rejects.toThrow(/DATABASE_URL/);
  });

  test("ein ungültiges Protokoll bricht ab und benennt die Variable", async () => {
    process.env.DATABASE_URL = "mysql://user:passwort@localhost:3306/velora";

    await expect(import("./env")).rejects.toThrow(/DATABASE_URL/);
  });

  test("eine leere DATABASE_URL wird wie eine fehlende behandelt", async () => {
    process.env.DATABASE_URL = "";

    await expect(import("./env")).rejects.toThrow(/DATABASE_URL/);
  });

  test("NODE_ENV fällt ohne Angabe auf development zurück", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    // @types/node (über next/types/global.d.ts) deklariert NODE_ENV als readonly — der
    // `delete`-Operator wäre ein Typfehler. Reflect.deleteProperty umgeht nur die Typprüfung
    // dieser Testdatei, nicht die eigentliche Laufzeitprüfung in lib/env.ts.
    Reflect.deleteProperty(process.env, "NODE_ENV");

    const { env } = await import("./env");

    expect(env.NODE_ENV).toBe("development");
  });

  test("SESSION_SECRET ist optional und fehlt ohne Angabe", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    delete process.env.SESSION_SECRET;

    const { env } = await import("./env");

    expect(env.SESSION_SECRET).toBeUndefined();
  });

  describe("Leere optionale Variablen gelten als nicht gesetzt (Produktionsvorfall)", () => {
    test("ein leeres SESSION_SECRET gilt als nicht gesetzt statt als Fehler", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.SESSION_SECRET = "";

      const { env } = await import("./env");

      expect(env.SESSION_SECRET).toBeUndefined();
    });

    test("ein nur aus Leerzeichen bestehendes SESSION_SECRET gilt als nicht gesetzt", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.SESSION_SECRET = "   ";

      const { env } = await import("./env");

      expect(env.SESSION_SECRET).toBeUndefined();
    });

    test("ein leeres ADMIN_BOOTSTRAP_EMAIL gilt als nicht gesetzt statt als ungültige E-Mail", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.ADMIN_BOOTSTRAP_EMAIL = "";

      const { env } = await import("./env");

      expect(env.ADMIN_BOOTSTRAP_EMAIL).toBeUndefined();
    });

    test("ein nur aus Leerzeichen bestehendes ADMIN_BOOTSTRAP_EMAIL gilt als nicht gesetzt", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.ADMIN_BOOTSTRAP_EMAIL = "  ";

      const { env } = await import("./env");

      expect(env.ADMIN_BOOTSTRAP_EMAIL).toBeUndefined();
    });

    test("eine leere DATABASE_URL (Pflichtvariable) bricht weiterhin ab und benennt die Variable", async () => {
      process.env.DATABASE_URL = "";

      await expect(import("./env")).rejects.toThrow(/DATABASE_URL/);
    });

    test("ein leeres BETTER_AUTH_SECRET (Pflichtvariable) bricht weiterhin ab und benennt die Variable", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.BETTER_AUTH_SECRET = "";

      await expect(import("./env")).rejects.toThrow(/BETTER_AUTH_SECRET/);
    });

    test("eine leere BETTER_AUTH_URL (Pflichtvariable) bricht weiterhin ab und benennt die Variable", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.BETTER_AUTH_SECRET = "a".repeat(32);
      process.env.BETTER_AUTH_URL = "";

      await expect(import("./env")).rejects.toThrow(/BETTER_AUTH_URL/);
    });

    test("ein leeres OAuth-Paar (beide leer statt fehlend) bleibt gültig, Provider inaktiv", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.OAUTH_GOOGLE_CLIENT_ID = "";
      process.env.OAUTH_GOOGLE_CLIENT_SECRET = "";

      const { env } = await import("./env");

      expect(env.OAUTH_GOOGLE_CLIENT_ID).toBeUndefined();
      expect(env.OAUTH_GOOGLE_CLIENT_SECRET).toBeUndefined();
    });

    test("ein OAuth-Paar mit einer leeren und einer gefüllten Hälfte bricht weiterhin ab", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.OAUTH_GITHUB_CLIENT_ID = "";
      process.env.OAUTH_GITHUB_CLIENT_SECRET = "github-secret";

      await expect(import("./env")).rejects.toThrow(/OAUTH_GITHUB_CLIENT_ID/);
    });

    test("ein nur aus Leerzeichen bestehendes TRUSTED_PROXY_IPS gilt als leere Liste", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.TRUSTED_PROXY_IPS = "   ";

      const { env } = await import("./env");

      expect(env.TRUSTED_PROXY_IPS).toEqual([]);
    });

    test("die tatsächlichen Zeilen aus .env.example ergeben eine gültige Konfiguration (Regressionstest gegen den Produktionsvorfall)", async () => {
      // Liest .env.example wie ein direktes `cp .env.example .env.local` es tun würde: Zeilen
      // parsen, Kommentare/Leerzeilen überspringen, Rest 1:1 in process.env übernehmen. Genau
      // dieser Ablauf brach vor der Korrektur beim `npm run build` auf dem Produktionsserver mit
      // sechs OAuth-Fehlern ab, weil die optionalen Zeilen leer statt auskommentiert waren.
      // Bewusst kein `new URL("../.env.example", import.meta.url)`: Vite erkennt dieses Literal-
      // Muster als Asset-Import und schreibt es beim Transform auf einen (hier falschen)
      // Wurzelpfad um. path.resolve() umgeht diese Sonderbehandlung.
      const testFileDir = dirname(fileURLToPath(import.meta.url));
      const exampleFilePath = resolve(testFileDir, "..", ".env.example");
      const exampleContent = readFileSync(exampleFilePath, "utf-8");
      for (const line of exampleContent.split("\n")) {
        const trimmedLine = line.trim();
        if (trimmedLine === "" || trimmedLine.startsWith("#")) continue;
        const equalsIndex = trimmedLine.indexOf("=");
        if (equalsIndex === -1) continue;
        const key = trimmedLine.slice(0, equalsIndex).trim();
        const value = trimmedLine.slice(equalsIndex + 1).trim();
        process.env[key] = value;
      }
      // BETTER_AUTH_SECRET ist im Template absichtlich leer (Geheimnis, wird nie eingecheckt) —
      // laut Anleitung muss dieser Wert vor dem ersten Start generiert werden. Alle übrigen
      // Zeilen bleiben unverändert aus der Vorlage, einschließlich der optionalen (jetzt
      // auskommentiert, siehe .env.example).
      process.env.BETTER_AUTH_SECRET = "a".repeat(32);
      // vitest.config.ts setzt OAUTH_DISCORD_CLIENT_ID/SECRET global als Test-Fixture (für
      // server/auth/create-auth.test.ts) — bei einem echten frischen `cp .env.example .env.local`
      // wären diese Variablen gar nicht vorhanden. Hier explizit entfernen, damit dieser Test die
      // reale Kopiersituation abbildet statt einen Testartefakt zu prüfen.
      delete process.env.OAUTH_DISCORD_CLIENT_ID;
      delete process.env.OAUTH_DISCORD_CLIENT_SECRET;

      const { env } = await import("./env");

      expect(env.DATABASE_URL).toBe("postgresql://velora:velora@localhost:5432/velora");
      expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
      expect(env.ADMIN_BOOTSTRAP_EMAIL).toBeUndefined();
      expect(env.OAUTH_GOOGLE_CLIENT_ID).toBeUndefined();
      expect(env.OAUTH_GOOGLE_CLIENT_SECRET).toBeUndefined();
      expect(env.OAUTH_GITHUB_CLIENT_ID).toBeUndefined();
      expect(env.OAUTH_GITHUB_CLIENT_SECRET).toBeUndefined();
      expect(env.OAUTH_DISCORD_CLIENT_ID).toBeUndefined();
      expect(env.OAUTH_DISCORD_CLIENT_SECRET).toBeUndefined();
      expect(env.TRUSTED_PROXY_IPS).toEqual([]);
    });
  });

  test("ADMIN_BOOTSTRAP_EMAIL muss bei Angabe eine gültige E-Mail-Adresse sein", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    process.env.ADMIN_BOOTSTRAP_EMAIL = "keine-email-adresse";

    await expect(import("./env")).rejects.toThrow(/ADMIN_BOOTSTRAP_EMAIL/);
  });

  test("ADMIN_BOOTSTRAP_EMAIL wird bei gültiger Angabe übernommen", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    process.env.ADMIN_BOOTSTRAP_EMAIL = "admin@example.com";

    const { env } = await import("./env");

    expect(env.ADMIN_BOOTSTRAP_EMAIL).toBe("admin@example.com");
  });

  test("fehlendes BETTER_AUTH_SECRET bricht den Prozess ab und benennt die Variable", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    delete process.env.BETTER_AUTH_SECRET;

    await expect(import("./env")).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  test("ein zu kurzes BETTER_AUTH_SECRET bricht ab", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    process.env.BETTER_AUTH_SECRET = "zu-kurz";

    await expect(import("./env")).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  test("ein ausreichend langes BETTER_AUTH_SECRET wird akzeptiert", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);

    const { env } = await import("./env");

    expect(env.BETTER_AUTH_SECRET).toBe("a".repeat(32));
  });

  test("fehlendes BETTER_AUTH_URL bricht den Prozess ab und benennt die Variable", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    delete process.env.BETTER_AUTH_URL;

    await expect(import("./env")).rejects.toThrow(/BETTER_AUTH_URL/);
  });

  test("eine ungültige BETTER_AUTH_URL bricht ab", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    process.env.BETTER_AUTH_URL = "keine-url";

    await expect(import("./env")).rejects.toThrow(/BETTER_AUTH_URL/);
  });

  test("eine gültige BETTER_AUTH_URL wird übernommen", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    process.env.BETTER_AUTH_URL = "https://velora.example.com";

    const { env } = await import("./env");

    expect(env.BETTER_AUTH_URL).toBe("https://velora.example.com");
  });

  test("nur eine gesetzte OAuth-Client-ID ohne Secret bricht ab (Google)", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    process.env.OAUTH_GOOGLE_CLIENT_ID = "google-client-id";
    delete process.env.OAUTH_GOOGLE_CLIENT_SECRET;

    await expect(import("./env")).rejects.toThrow(/OAUTH_GOOGLE_CLIENT_SECRET/);
  });

  test("nur ein gesetztes OAuth-Secret ohne ID bricht ab (GitHub)", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    delete process.env.OAUTH_GITHUB_CLIENT_ID;
    process.env.OAUTH_GITHUB_CLIENT_SECRET = "github-secret";

    await expect(import("./env")).rejects.toThrow(/OAUTH_GITHUB_CLIENT_ID/);
  });

  test("beide OAuth-Werte gesetzt werden akzeptiert (Discord)", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    process.env.OAUTH_DISCORD_CLIENT_ID = "discord-client-id";
    process.env.OAUTH_DISCORD_CLIENT_SECRET = "discord-secret";

    const { env } = await import("./env");

    expect(env.OAUTH_DISCORD_CLIENT_ID).toBe("discord-client-id");
    expect(env.OAUTH_DISCORD_CLIENT_SECRET).toBe("discord-secret");
  });

  test("beide OAuth-Werte fehlend wird akzeptiert (Provider bleibt inaktiv)", async () => {
    process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
    delete process.env.OAUTH_DISCORD_CLIENT_ID;
    delete process.env.OAUTH_DISCORD_CLIENT_SECRET;

    const { env } = await import("./env");

    expect(env.OAUTH_DISCORD_CLIENT_ID).toBeUndefined();
    expect(env.OAUTH_DISCORD_CLIENT_SECRET).toBeUndefined();
  });

  describe("BETTER_AUTH_URL: https-Zwang in Produktion (Befund 5)", () => {
    test("eine http://-BETTER_AUTH_URL bricht in Produktion ab", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      // NODE_ENV ist laut next/types/global.d.ts readonly getypt — wie bei der bestehenden
      // "fällt zurück auf development"-Prüfung oben wird der Typcheck deshalb über Reflect
      // umgangen, nicht die tatsächliche Laufzeitprüfung in lib/env.ts.
      Reflect.set(process.env, "NODE_ENV", "production");
      process.env.BETTER_AUTH_URL = "http://velora.example.com";

      await expect(import("./env")).rejects.toThrow(/BETTER_AUTH_URL/);
    });

    test("eine https://-BETTER_AUTH_URL wird in Produktion akzeptiert", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      Reflect.set(process.env, "NODE_ENV", "production");
      process.env.BETTER_AUTH_URL = "https://velora.example.com";

      const { env } = await import("./env");

      expect(env.BETTER_AUTH_URL).toBe("https://velora.example.com");
    });

    test("eine http://-BETTER_AUTH_URL bleibt außerhalb von Produktion erlaubt", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      Reflect.set(process.env, "NODE_ENV", "development");
      process.env.BETTER_AUTH_URL = "http://localhost:3000";

      const { env } = await import("./env");

      expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
    });
  });

  describe("TRUSTED_PROXY_IPS (Befund 1)", () => {
    test("ist ohne Angabe eine leere Liste — kein Proxy wird vertraut", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      delete process.env.TRUSTED_PROXY_IPS;

      const { env } = await import("./env");

      expect(env.TRUSTED_PROXY_IPS).toEqual([]);
    });

    test("akzeptiert eine kommagetrennte Liste aus IP-Adressen und CIDR-Bereichen", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.TRUSTED_PROXY_IPS = " 203.0.113.1 , 10.0.0.0/8 , 2001:db8::/32 ";

      const { env } = await import("./env");

      expect(env.TRUSTED_PROXY_IPS).toEqual(["203.0.113.1", "10.0.0.0/8", "2001:db8::/32"]);
    });

    test("lehnt einen ungültigen Eintrag ab und benennt die Variable", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.TRUSTED_PROXY_IPS = "nicht-eine-ip-adresse";

      await expect(import("./env")).rejects.toThrow(/TRUSTED_PROXY_IPS/);
    });

    test("lehnt ein CIDR-Präfix außerhalb des gültigen Bereichs ab", async () => {
      process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
      process.env.TRUSTED_PROXY_IPS = "10.0.0.0/33";

      await expect(import("./env")).rejects.toThrow(/TRUSTED_PROXY_IPS/);
    });
  });
});
