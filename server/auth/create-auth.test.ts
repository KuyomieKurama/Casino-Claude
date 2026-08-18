// @vitest-environment node
// Gleicher Grund wie server/db/migration.test.ts: PGlite braucht die echte Node-Fetch-Implementierung.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user, verification } from "@/server/db/auth-schema";
import { createAuth, type VeloraAuth } from "./create-auth";
import { createAuthGuards, UnauthenticatedError, UnauthorizedError } from "./guards";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const BASE_URL = "http://localhost:3000";

let db: TestDatabase;
let auth: VeloraAuth;

beforeEach(async () => {
  db = await createTestDatabase();
  auth = createAuth(db);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Baut ein Set-Cookie → Cookie-Header (Name=Wert, ohne Attribute) für Folgeanfragen. */
function toCookieHeader(response: Response): string {
  const setCookies = response.headers.getSetCookie();
  return setCookies.map((raw) => raw.split(";")[0]).join("; ");
}

function jsonRequest(path: string, body: unknown, extraHeaders?: Record<string, string>): Request {
  return new Request(`${BASE_URL}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

async function signUp(email: string, password: string, name = "Testperson") {
  const response = await auth.handler(jsonRequest("/sign-up/email", { email, password, name }));
  return response;
}

/**
 * `emailAndPassword.autoSignIn: false` (Befund 2 des Security-Reviews, siehe create-auth.ts):
 * Registrierung eröffnet keine Sitzung mehr automatisch — sonst würde die bloße Anwesenheit
 * eines Set-Cookie-Headers auf der Sign-up-Antwort verraten, ob die E-Mail neu war oder schon
 * existierte. Tests, die eine angemeldete Sitzung brauchen, melden deshalb nach der
 * Registrierung explizit an.
 */
async function signIn(email: string, password: string): Promise<Response> {
  return auth.handler(jsonRequest("/sign-in/email", { email, password }));
}

describe("Registrierung, Anmeldung, Abmeldung", () => {
  test("registriert, meldet an und meldet ab; die Sitzung ist danach serverseitig widerrufbar", async () => {
    const signUpResponse = await signUp("spieler@example.com", "ein-sicheres-passwort-123");
    expect(signUpResponse.status).toBe(200);

    const signInResponse = await signIn("spieler@example.com", "ein-sicheres-passwort-123");
    expect(signInResponse.status).toBe(200);
    const cookie = toCookieHeader(signInResponse);
    expect(cookie).toMatch(/session_token/);

    const guards = createAuthGuards(auth);
    const headers = new Headers({ cookie });
    const sessionBefore = await guards.getSession(headers);
    expect(sessionBefore?.user.email).toBe("spieler@example.com");

    const signOutResponse = await auth.handler(new Request(`${BASE_URL}/api/auth/sign-out`, { method: "POST", headers: { cookie } }));
    expect(signOutResponse.status).toBe(200);

    // Dieselbe Sitzung ist danach nicht mehr gültig — nicht nur clientseitig "vergessen",
    // sondern serverseitig widerrufen (die Zeile in `session` existiert nicht mehr).
    const sessionAfter = await guards.getSession(headers);
    expect(sessionAfter).toBeNull();
  });

  test("Anmeldung mit korrektem Passwort liefert eine gültige Sitzung", async () => {
    await signUp("login@example.com", "ein-sicheres-passwort-123");
    const response = await auth.handler(jsonRequest("/sign-in/email", { email: "login@example.com", password: "ein-sicheres-passwort-123" }));
    expect(response.status).toBe(200);
    expect(toCookieHeader(response)).toMatch(/session_token/);
  });
});

describe("Kein Passwort-Hash in der Nutzerdarstellung", () => {
  test("die Antwort von sign-up/email enthält kein password-Feld", async () => {
    const response = await signUp("keinhash@example.com", "ein-sicheres-passwort-123");
    const body = (await response.json()) as { user: Record<string, unknown> };
    expect(body.user).not.toHaveProperty("password");
    expect(JSON.stringify(body.user)).not.toContain("ein-sicheres-passwort-123");
  });

  test("die Antwort von get-session enthält kein password-Feld", async () => {
    await signUp("keinhash2@example.com", "ein-sicheres-passwort-123");
    const signInResponse = await signIn("keinhash2@example.com", "ein-sicheres-passwort-123");
    const cookie = toCookieHeader(signInResponse);
    const response = await auth.handler(new Request(`${BASE_URL}/api/auth/get-session`, { headers: { cookie } }));
    const body = (await response.json()) as { user: Record<string, unknown> };
    expect(body.user).not.toHaveProperty("password");
  });
});

describe("Keine Nutzer-Enumeration", () => {
  test("unbekanntes Konto und falsches Passwort liefern dieselbe Fehlermeldung", async () => {
    await signUp("existiert@example.com", "das-richtige-passwort-123");

    const unknownAccount = await auth.handler(jsonRequest("/sign-in/email", { email: "existiert-nicht@example.com", password: "irgendwas-12345" }));
    const wrongPassword = await auth.handler(jsonRequest("/sign-in/email", { email: "existiert@example.com", password: "falsches-passwort-123" }));

    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    const unknownBody = (await unknownAccount.json()) as { message?: string; code?: string };
    const wrongBody = (await wrongPassword.json()) as { message?: string; code?: string };
    expect(unknownBody.code).toBe(wrongBody.code);
    expect(unknownBody.message).toBe(wrongBody.message);
  });
});

describe("Keine Nutzer-Enumeration bei der Registrierung (Befund 2)", () => {
  test("Registrierung mit bereits vergebener und mit neuer E-Mail liefert ununterscheidbare Antworten", async () => {
    await signUp("vorhanden@example.com", "das-erste-passwort-123");

    const duplicateResponse = await signUp("vorhanden@example.com", "ein-anderes-passwort-456", "Anderer Name");
    const freshResponse = await signUp("brandneu@example.com", "ein-anderes-passwort-456", "Anderer Name");

    // Gleicher Statuscode für beide Fälle — vorher (ohne autoSignIn: false) lieferte eine
    // bereits vergebene E-Mail HTTP 422 (USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL), eine neue
    // E-Mail dagegen HTTP 200: allein am Statuscode ließ sich die Existenz eines Kontos ablesen.
    expect(duplicateResponse.status).toBe(freshResponse.status);
    expect(duplicateResponse.status).toBe(200);

    // Keine Sitzung wird bei der Registrierung mehr automatisch eröffnet: kein Set-Cookie in
    // BEIDEN Fällen — sonst würde die bloße Anwesenheit eines Session-Cookies verraten, ob das
    // Konto neu angelegt wurde oder schon existierte.
    expect(toCookieHeader(duplicateResponse)).toBe("");
    expect(toCookieHeader(freshResponse)).toBe("");

    const duplicateBody = (await duplicateResponse.json()) as { token: unknown; user: Record<string, unknown> };
    const freshBody = (await freshResponse.json()) as { token: unknown; user: Record<string, unknown> };

    expect(duplicateBody.token).toBeNull();
    expect(freshBody.token).toBeNull();
    // Gleiche Antwortform (dieselben Schlüssel) in beiden Fällen — kein Fehlerfeld
    // (message/code), das den Unterschied verraten würde.
    expect(Object.keys(duplicateBody.user).sort()).toEqual(Object.keys(freshBody.user).sort());
    expect(duplicateBody.user).not.toHaveProperty("message");
    expect(duplicateBody.user).not.toHaveProperty("code");

    // Das ursprüngliche Konto bleibt unangetastet: keine zweite Zeile, kein überschriebener Name.
    const usersWithDuplicateEmail = await db.select().from(user).where(eq(user.email, "vorhanden@example.com"));
    expect(usersWithDuplicateEmail).toHaveLength(1);
    expect(usersWithDuplicateEmail[0]?.name).not.toBe("Anderer Name");
  });
});

describe("Sitzungen werden bei einem Passwort-Reset widerrufen (Befund 4)", () => {
  test("eine zuvor bestehende Sitzung wird nach einem Passwort-Reset ungültig; das neue Passwort gilt, das alte nicht mehr", async () => {
    await signUp("reset@example.com", "altes-passwort-123");
    const signInResponse = await signIn("reset@example.com", "altes-passwort-123");
    const cookie = toCookieHeader(signInResponse);

    const guards = createAuthGuards(auth);
    expect(await guards.getSession(new Headers({ cookie }))).not.toBeNull();

    const [resetUser] = await db.select().from(user).where(eq(user.email, "reset@example.com"));
    if (!resetUser) throw new Error("Testvoraussetzung verletzt: Nutzer wurde nicht angelegt.");

    // Kein E-Mail-Versand im Projekt (siehe Auftrag): /request-password-reset lehnt ohne
    // konfigurierte sendResetPassword-Funktion ab (RESET_PASSWORD_DISABLED). Der eigentliche
    // /reset-password-Endpunkt kennt den Versandweg selbst nicht — er verlangt nur einen
    // gültigen Eintrag in der verification-Tabelle
    // (node_modules/better-auth/dist/api/routes/password.mjs, `resetPassword`:
    // `consumeVerificationValue("reset-password:" + token)`). Der Token wird deshalb hier direkt
    // angelegt, GENAU wie es /request-password-reset intern täte — kein Fake-Versand, sondern
    // dieselbe Datenbankzeile, die ein echter Versand ebenfalls erzeugen würde.
    const resetToken = "test-reset-token";
    await db.insert(verification).values({
      id: crypto.randomUUID(),
      identifier: `reset-password:${resetToken}`,
      value: resetUser.id,
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const resetResponse = await auth.handler(jsonRequest("/reset-password", { token: resetToken, newPassword: "neues-passwort-456" }));
    expect(resetResponse.status).toBe(200);

    // Die VORHER bestehende Sitzung ist jetzt ungültig — nicht erst nach Ablauf, sondern sofort.
    const sessionAfterReset = await guards.getSession(new Headers({ cookie }));
    expect(sessionAfterReset).toBeNull();

    const loginWithNewPassword = await signIn("reset@example.com", "neues-passwort-456");
    expect(loginWithNewPassword.status).toBe(200);

    const loginWithOldPassword = await signIn("reset@example.com", "altes-passwort-123");
    expect(loginWithOldPassword.status).toBe(401);
  });
});

describe("Rate Limiting beim Passwort-Login", () => {
  test("greift nach 5 Fehlversuchen für dieselbe E-Mail und lässt danach wieder zu", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const start = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(start);

    await signUp("gesperrt@example.com", "das-richtige-passwort-123");

    for (let i = 0; i < 5; i++) {
      const response = await auth.handler(jsonRequest("/sign-in/email", { email: "gesperrt@example.com", password: "falsch-12345" }, { "x-forwarded-for": "203.0.113.1" }));
      expect(response.status).toBe(401);
    }

    const blocked = await auth.handler(jsonRequest("/sign-in/email", { email: "gesperrt@example.com", password: "falsch-12345" }, { "x-forwarded-for": "203.0.113.1" }));
    expect(blocked.status).toBe(429);

    // Selbst das RICHTIGE Passwort wird während der Sperre abgelehnt.
    const blockedEvenCorrect = await auth.handler(jsonRequest("/sign-in/email", { email: "gesperrt@example.com", password: "das-richtige-passwort-123" }, { "x-forwarded-for": "203.0.113.1" }));
    expect(blockedEvenCorrect.status).toBe(429);

    // 16 Minuten später (Fenster: 15 Minuten) ist die Sperre wieder aufgehoben.
    vi.setSystemTime(new Date(start.getTime() + 16 * 60_000));
    const allowedAgain = await auth.handler(jsonRequest("/sign-in/email", { email: "gesperrt@example.com", password: "das-richtige-passwort-123" }, { "x-forwarded-for": "203.0.113.1" }));
    expect(allowedAgain.status).toBe(200);
  });
});

describe("requireAdmin", () => {
  async function signUpAndGetCookie(email: string): Promise<string> {
    await signUp(email, "ein-sicheres-passwort-123");
    const signInResponse = await signIn(email, "ein-sicheres-passwort-123");
    return toCookieHeader(signInResponse);
  }

  test("lehnt normale Nutzer ab", async () => {
    const cookie = await signUpAndGetCookie("normal@example.com");
    const guards = createAuthGuards(auth);
    await expect(guards.requireAdmin(new Headers({ cookie }))).rejects.toThrow(UnauthorizedError);
  });

  test("lässt Admins mit aktivem Konto durch", async () => {
    const cookie = await signUpAndGetCookie("admin@example.com");
    await db.update(user).set({ role: "admin" }).where(eq(user.email, "admin@example.com"));

    const guards = createAuthGuards(auth);
    const session = await guards.requireAdmin(new Headers({ cookie }));
    expect(session.user.role).toBe("admin");
  });

  test("lehnt gesperrte Admins ab (status: disabled)", async () => {
    const cookie = await signUpAndGetCookie("gesperrter-admin@example.com");
    await db.update(user).set({ role: "admin", status: "disabled" }).where(eq(user.email, "gesperrter-admin@example.com"));

    const guards = createAuthGuards(auth);
    await expect(guards.requireAdmin(new Headers({ cookie }))).rejects.toThrow(UnauthorizedError);
  });

  test("wirft UnauthenticatedError ohne Sitzung", async () => {
    const guards = createAuthGuards(auth);
    await expect(guards.requireUser(new Headers())).rejects.toThrow(UnauthenticatedError);
  });
});

describe("Account-Verknüpfung über OAuth", () => {
  interface DiscordProfile {
    id: string;
    username: string;
    email: string;
    verified: boolean;
    avatar: null;
    discriminator: string;
  }

  function stubDiscordFetch(profile: DiscordProfile): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith("https://discord.com/api/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: "fake-access-token", token_type: "Bearer", expires_in: 3600, scope: "identify email" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.startsWith("https://discord.com/api/users/%40me") || url.startsWith("https://discord.com/api/users/@me")) {
          return new Response(JSON.stringify(profile), { status: 200, headers: { "content-type": "application/json" } });
        }
        throw new Error(`Unerwarteter fetch-Aufruf im Test: ${url}`);
      }),
    );
  }

  async function signInWithDiscord(profile: DiscordProfile): Promise<Response> {
    stubDiscordFetch(profile);
    const startResponse = await auth.handler(jsonRequest("/sign-in/social", { provider: "discord", callbackURL: "/" }));
    const startBody = (await startResponse.json()) as { url: string };
    const state = new URL(startBody.url).searchParams.get("state");
    expect(state).toBeTruthy();
    // Verteidigung gegen CSRF: better-auth verlangt beim Callback zusätzlich zum
    // DB-persistierten State ein signiertes "state"-Cookie aus genau demselben Start-Request
    // (node_modules/better-auth/dist/state.mjs, parseGenericState) — muss deshalb hier
    // weitergereicht werden, sonst schlägt der Callback mit "State not persisted correctly" fehl.
    const cookie = toCookieHeader(startResponse);
    return auth.handler(new Request(`${BASE_URL}/api/auth/callback/discord?state=${state}&code=fake-code`, { headers: { cookie } }));
  }

  test("dieselbe verifizierte E-Mail über einen zweiten Provider landet auf demselben Konto", async () => {
    // Lokales Konto existiert bereits und ist verifiziert (Voraussetzung für automatisches
    // Verknüpfen, siehe server/auth/create-auth.ts: requireLocalEmailVerified, Standard true).
    await signUp("gemeinsam@example.com", "ein-sicheres-passwort-123");
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, "gemeinsam@example.com"));
    const usersBefore = await db.select().from(user);
    expect(usersBefore).toHaveLength(1);

    const callbackResponse = await signInWithDiscord({ id: "100000000000000001", username: "Gemeinsam", email: "gemeinsam@example.com", verified: true, avatar: null, discriminator: "0" });

    expect([200, 302]).toContain(callbackResponse.status);
    const usersAfter = await db.select().from(user);
    expect(usersAfter).toHaveLength(1);
  });

  test("eine unverifizierte fremde E-Mail übernimmt kein bestehendes Konto", async () => {
    await signUp("opfer@example.com", "ein-sicheres-passwort-123");
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, "opfer@example.com"));

    await signInWithDiscord({ id: "100000000000000002", username: "Angreifer", email: "opfer@example.com", verified: false, avatar: null, discriminator: "0" });

    // Kein automatisches Verknüpfen: die bestehende Zeile bleibt unverändert (weiterhin per
    // Passwort geführt), es entsteht höchstens ein zweites, unabhängiges Konto — auf keinen
    // Fall übernimmt die unverifizierte Fremdidentität das bestehende Konto.
    const [victim] = await db.select().from(user).where(eq(user.email, "opfer@example.com"));
    expect(victim?.emailVerified).toBe(true);
  });
});
