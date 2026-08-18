import { describe, expect, it } from "vitest";
import { clampVolume, DEFAULT_SOUND_SETTINGS, DEFAULT_VOLUME } from "./types";

describe("clampVolume", () => {
  it("lässt gültige Werte im Bereich 0..1 unverändert", () => {
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(0.42)).toBe(0.42);
    expect(clampVolume(1)).toBe(1);
  });

  it("begrenzt Werte oberhalb 1 auf 1", () => {
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(100)).toBe(1);
  });

  it("begrenzt Werte unterhalb 0 auf 0", () => {
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(-100)).toBe(0);
  });

  it("fällt bei NaN auf die Standardlautstärke zurück", () => {
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
  });

  it("fällt bei nicht-numerischen Werten auf die Standardlautstärke zurück", () => {
    // Eingaben aus LocalStorage sind unknown — clampVolume muss auch fremde Formen abfangen.
    expect(clampVolume("0.5" as unknown as number)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(undefined as unknown as number)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(null as unknown as number)).toBe(DEFAULT_VOLUME);
  });
});

describe("DEFAULT_SOUND_SETTINGS", () => {
  it("ist standardmäßig deaktiviert (Regel 7 / Auftrag §2)", () => {
    expect(DEFAULT_SOUND_SETTINGS.enabled).toBe(false);
  });

  it("hat eine gültige Vorgabe-Lautstärke im Bereich 0..1", () => {
    expect(DEFAULT_SOUND_SETTINGS.volume).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SOUND_SETTINGS.volume).toBeLessThanOrEqual(1);
  });
});
