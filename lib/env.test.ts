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
});
