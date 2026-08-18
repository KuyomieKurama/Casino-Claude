import { describe, expect, it } from "vitest";
import {
  GENERIC_LOGIN_ERROR,
  GENERIC_LOGIN_UNAVAILABLE_ERROR,
  GENERIC_REGISTER_UNAVAILABLE_ERROR,
  RATE_LIMIT_FALLBACK_ERROR,
  loginErrorMessage,
  registerErrorMessage,
} from "./auth-errors";

describe("loginErrorMessage", () => {
  it("zeigt für unbekanntes Konto (401) dieselbe generische Meldung wie für falsches Passwort (401)", () => {
    const unknownAccount = loginErrorMessage({ status: 401, message: "Invalid email or password" });
    const wrongPassword = loginErrorMessage({ status: 401, message: "Invalid email or password" });
    expect(unknownAccount).toBe(wrongPassword);
    expect(unknownAccount).toBe(GENERIC_LOGIN_ERROR);
  });

  it("ignoriert die Bibliotheksmeldung bei 401 vollständig (nie Englisch, nie unterscheidbar)", () => {
    expect(loginErrorMessage({ status: 401, message: "irgendetwas anderes" })).toBe(GENERIC_LOGIN_ERROR);
    expect(loginErrorMessage({ status: 401 })).toBe(GENERIC_LOGIN_ERROR);
  });

  it("zeigt bei 429 die vom Server mitgelieferte Meldung", () => {
    const message = loginErrorMessage({ status: 429, message: "Zu viele Anmeldeversuche. Was tun: Kurz warten." });
    expect(message).toBe("Zu viele Anmeldeversuche. Was tun: Kurz warten.");
  });

  it("fällt bei 429 ohne Servermeldung auf die eigene Rate-Limit-Meldung zurück", () => {
    expect(loginErrorMessage({ status: 429 })).toBe(RATE_LIMIT_FALLBACK_ERROR);
    expect(loginErrorMessage({ status: 429, message: "   " })).toBe(RATE_LIMIT_FALLBACK_ERROR);
  });

  it("zeigt für unerwartete Statuscodes eine generische 'derzeit nicht möglich'-Meldung", () => {
    expect(loginErrorMessage({ status: 500 })).toBe(GENERIC_LOGIN_UNAVAILABLE_ERROR);
    expect(loginErrorMessage({ status: 0 })).toBe(GENERIC_LOGIN_UNAVAILABLE_ERROR);
  });
});

describe("registerErrorMessage", () => {
  it("zeigt bei 429 die Servermeldung, sonst den eigenen Fallback", () => {
    expect(registerErrorMessage({ status: 429, message: "Bitte warten." })).toBe("Bitte warten.");
    expect(registerErrorMessage({ status: 429 })).toBe(RATE_LIMIT_FALLBACK_ERROR);
  });

  it("zeigt für alle übrigen Statuscodes eine generische Registrierungs-Meldung", () => {
    expect(registerErrorMessage({ status: 500 })).toBe(GENERIC_REGISTER_UNAVAILABLE_ERROR);
    expect(registerErrorMessage({ status: 401 })).toBe(GENERIC_REGISTER_UNAVAILABLE_ERROR);
  });
});
