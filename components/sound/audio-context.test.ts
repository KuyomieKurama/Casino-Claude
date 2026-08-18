import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioContext } from "./audio-context";

describe("createAudioContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("liefert null, wenn der Browser kein Web Audio kennt (jsdom-Standardfall — genau das ist hier der Testfall)", () => {
    // jsdom stellt window.AudioContext nicht bereit — kein Stubbing nötig, das ist der Ist-Zustand.
    expect(createAudioContext()).toBeNull();
  });

  it("erzeugt eine Instanz über window.AudioContext, wenn vorhanden", () => {
    class FakeAudioContext {
      state = "running";
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const ctx = createAudioContext();
    expect(ctx).toBeInstanceOf(FakeAudioContext);
  });

  it("fällt auf webkitAudioContext zurück, wenn nur das präfigierte Konstrukt existiert (Safari)", () => {
    class FakeWebkitAudioContext {
      state = "running";
    }
    vi.stubGlobal("webkitAudioContext", FakeWebkitAudioContext);
    const ctx = createAudioContext();
    expect(ctx).toBeInstanceOf(FakeWebkitAudioContext);
  });

  it("wirft nie, auch wenn der Konstruktor selbst wirft (z. B. Browser-Richtlinie ohne Nutzergeste)", () => {
    class ThrowingAudioContext {
      constructor() {
        throw new Error("blockiert");
      }
    }
    vi.stubGlobal("AudioContext", ThrowingAudioContext);
    expect(() => createAudioContext()).not.toThrow();
    expect(createAudioContext()).toBeNull();
  });
});
