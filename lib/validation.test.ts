import { describe, expect, it } from "vitest";
import { firstErrorField, validateLogin, validateRegister } from "./validation";

describe("Validierung", () => {
  it("#9 leer, ungültige E-Mail, zu kurzes Passwort, Nichtübereinstimmung", () => {
    const empty = validateRegister({ displayName: "", email: "", password: "", passwordConfirm: "", acceptTerms: false });
    expect(Object.keys(empty).sort()).toEqual(["acceptTerms", "displayName", "email", "password", "passwordConfirm"]);

    expect(validateLogin({ email: "kein-at-zeichen", password: "langgenug" }).email).toMatch(/E-Mail/);
    expect(validateLogin({ email: "a@b", password: "langgenug" }).email).toBeDefined();
    expect(validateLogin({ email: "name@beispiel.de", password: "langgenug" })).toEqual({});

    expect(validateLogin({ email: "name@beispiel.de", password: "kurz" }).password).toMatch(/zu kurz/);
    expect(validateLogin({ email: "name@beispiel.de", password: "12345678" }).password).toBeUndefined();

    const mismatch = validateRegister({ displayName: "Kim", email: "kim@beispiel.de", password: "geheimnis1", passwordConfirm: "geheimnis2", acceptTerms: true });
    expect(mismatch).toEqual({ passwordConfirm: expect.stringMatching(/stimmen nicht überein/) });

    const ok = validateRegister({ displayName: "Kim", email: "kim@beispiel.de", password: "geheimnis1", passwordConfirm: "geheimnis1", acceptTerms: true });
    expect(ok).toEqual({});
  });

  it("Fokus wandert auf das erste fehlerhafte Feld in Formularreihenfolge", () => {
    const errors = validateRegister({ displayName: "Kim", email: "", password: "kurz", passwordConfirm: "", acceptTerms: false });
    expect(firstErrorField(["displayName", "email", "password", "passwordConfirm", "acceptTerms"], errors)).toBe("email");
    expect(firstErrorField(["displayName"], {})).toBeUndefined();
  });

  it("Meldungen sagen, was passiert ist und was zu tun ist — ohne Entschuldigung", () => {
    const all = Object.values(validateRegister({ displayName: "", email: "x", password: "1", passwordConfirm: "2", acceptTerms: false }));
    for (const msg of all) {
      expect(msg).toMatch(/Bitte|prüfe|verwende|stimme/);
      expect(msg.toLowerCase()).not.toMatch(/entschuldig|sorry|leider/);
    }
  });
});
