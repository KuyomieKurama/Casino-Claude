import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/** Siehe lib/env.test.ts: server-only wirft außerhalb von Next.js immer, deshalb gemockt. */
vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };

function resetOAuthEnv(): void {
  for (const key of [
    "OAUTH_GOOGLE_CLIENT_ID",
    "OAUTH_GOOGLE_CLIENT_SECRET",
    "OAUTH_GITHUB_CLIENT_ID",
    "OAUTH_GITHUB_CLIENT_SECRET",
    "OAUTH_DISCORD_CLIENT_ID",
    "OAUTH_DISCORD_CLIENT_SECRET",
  ]) {
    delete process.env[key];
  }
}

beforeEach(() => {
  vi.resetModules();
  process.env.DATABASE_URL = "postgresql://user:passwort@localhost:5432/velora";
  resetOAuthEnv();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("server/auth/providers", () => {
  test("kein Provider ist ohne Zugangsdaten aktiv", async () => {
    const { getActiveOAuthProviders } = await import("./providers");

    expect(getActiveOAuthProviders()).toEqual([]);
  });

  test("ein Provider mit vollständigen Zugangsdaten ist aktiv", async () => {
    process.env.OAUTH_GOOGLE_CLIENT_ID = "google-id";
    process.env.OAUTH_GOOGLE_CLIENT_SECRET = "google-secret";

    const { getActiveOAuthProviders } = await import("./providers");
    const active = getActiveOAuthProviders();

    expect(active).toHaveLength(1);
    expect(active[0]).toEqual({ key: "google", displayName: "Google", clientId: "google-id", clientSecret: "google-secret" });
  });

  test("mehrere vollständig konfigurierte Provider sind alle aktiv", async () => {
    process.env.OAUTH_GOOGLE_CLIENT_ID = "google-id";
    process.env.OAUTH_GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.OAUTH_GITHUB_CLIENT_ID = "github-id";
    process.env.OAUTH_GITHUB_CLIENT_SECRET = "github-secret";

    const { getActiveOAuthProviders } = await import("./providers");
    const keys = getActiveOAuthProviders().map((p) => p.key);

    expect(keys.sort()).toEqual(["github", "google"]);
  });

  test("getActiveOAuthProviderMap liefert eine nach Provider-Schlüssel indizierte Map", async () => {
    process.env.OAUTH_DISCORD_CLIENT_ID = "discord-id";
    process.env.OAUTH_DISCORD_CLIENT_SECRET = "discord-secret";

    const { getActiveOAuthProviderMap } = await import("./providers");
    const map = getActiveOAuthProviderMap();

    expect(map.discord).toEqual({ clientId: "discord-id", clientSecret: "discord-secret" });
    expect(map.google).toBeUndefined();
  });

  test("getOAuthProviderStatuses liefert alle drei Provider mit configured-Flag, aber ohne Zugangsdaten", async () => {
    process.env.OAUTH_GOOGLE_CLIENT_ID = "google-id";
    process.env.OAUTH_GOOGLE_CLIENT_SECRET = "google-secret";

    const { getOAuthProviderStatuses } = await import("./providers");
    const statuses = getOAuthProviderStatuses();

    expect(statuses).toHaveLength(3);
    const google = statuses.find((s) => s.key === "google");
    expect(google).toEqual({ key: "google", displayName: "Google", configured: true });
    const github = statuses.find((s) => s.key === "github");
    expect(github).toEqual({ key: "github", displayName: "GitHub", configured: false });
    // Keine Zugangsdaten in der Antwort — nur configured-Booleans.
    for (const status of statuses) {
      expect(status).not.toHaveProperty("clientId");
      expect(status).not.toHaveProperty("clientSecret");
    }
  });
});
