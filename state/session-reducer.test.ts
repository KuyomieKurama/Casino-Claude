import { describe, expect, it } from "vitest";
import { initialSessionState, sessionReducer, toPersistedSession } from "./session-reducer";

const now = "2026-08-15T10:00:00.000Z";

describe("Session-Reducer", () => {
  it("#12 Kein Passwort landet im persistierten State (Regressionstest zu Regel 5)", () => {
    const secret = "MeinEchtesPasswort!2026";
    // Der Reducer kennt keinen Passwort-Parameter. Wir simulieren trotzdem den kompletten
    // Registrierungs- und Login-Ablauf und prüfen den serialisierten State auf Spuren.
    let s = sessionReducer({ ...initialSessionState, hydrated: true }, {
      type: "REGISTER",
      displayName: "Kim Muster",
      email: "kim@beispiel.de",
      now,
      id: "u1",
    });
    s = sessionReducer(s, { type: "LOGOUT" });
    s = sessionReducer(s, { type: "LOGIN", email: "kim@beispiel.de", rememberMe: true, now, id: "u2" });
    const persisted = JSON.stringify(toPersistedSession(s));
    expect(persisted).not.toContain(secret);
    expect(persisted.toLowerCase()).not.toContain("password");
    expect(persisted.toLowerCase()).not.toContain("passwort");
    expect(Object.keys(toPersistedSession(s)).sort()).toEqual(["adminEnabled", "profile", "rememberMe", "sessionExpiresAt", "user"]);
    expect(Object.keys(s.user ?? {}).sort()).toEqual(["createdAt", "displayName", "email", "id", "role"]);
  });

  it("Login ohne „Eingeloggt bleiben“ läuft ab; Hydration erkennt das und setzt expiredNotice", () => {
    let s = sessionReducer({ ...initialSessionState, hydrated: true }, { type: "LOGIN", email: "a@b.de", rememberMe: false, now, id: "u1" });
    expect(s.user?.displayName).toBe("A");
    expect(s.sessionExpiresAt).not.toBeNull();
    const later = new Date(Date.parse(now) + 2 * 60 * 60_000).toISOString();
    s = sessionReducer(s, { type: "CHECK_EXPIRY", now: later });
    expect(s.user).toBeNull();
    expect(s.expiredNotice).toBe(true);

    const fresh = sessionReducer({ ...initialSessionState, hydrated: true }, { type: "LOGIN", email: "a@b.de", rememberMe: false, now, id: "u1" });
    const persisted = JSON.parse(JSON.stringify(toPersistedSession(fresh)));
    const rehydrated = sessionReducer(initialSessionState, { type: "HYDRATE", slice: persisted, now: later });
    expect(rehydrated.user).toBeNull();
    expect(rehydrated.expiredNotice).toBe(true);
    const inTime = sessionReducer(initialSessionState, { type: "HYDRATE", slice: persisted, now });
    expect(inTime.user?.email).toBe("a@b.de");
  });

  it("Erneute Anmeldung mit bekannter E-Mail übernimmt den registrierten Anzeigenamen", () => {
    let s = sessionReducer({ ...initialSessionState, hydrated: true }, { type: "REGISTER", displayName: "Kim", email: "Kim@Beispiel.de", now, id: "u1" });
    s = sessionReducer(s, { type: "LOGOUT" });
    s = sessionReducer(s, { type: "LOGIN", email: "kim@beispiel.de", rememberMe: true, now, id: "u9" });
    expect(s.user?.displayName).toBe("Kim");
    expect(s.user?.id).toBe("u1");
  });

  it("Admin-Umschalter ist reine Anzeigelogik und unabhängig vom Login", () => {
    const s = sessionReducer({ ...initialSessionState, hydrated: true }, { type: "SET_ADMIN_ENABLED", enabled: true });
    expect(s.adminEnabled).toBe(true);
    expect(s.user).toBeNull();
  });
});
