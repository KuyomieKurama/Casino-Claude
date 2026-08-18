import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetStorageForTests, loadPersisted } from "@/lib/storage";
import { DEFAULT_VOLUME } from "@/lib/sound/types";
import { __resetSoundStoreForTests, getServerSnapshot, getSnapshot, play, setEnabled, setVolume, subscribe } from "./sound-store";

describe("sound-store", () => {
  beforeEach(() => {
    __resetSoundStoreForTests();
    __resetStorageForTests();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("#DoD Standardzustand ist 'aus', mit moderater Vorgabe-Lautstärke", () => {
    const snapshot = getSnapshot();
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.volume).toBe(DEFAULT_VOLUME);
  });

  it("getServerSnapshot liefert immer den Default, unabhängig vom Client-Zustand", () => {
    setEnabled(true);
    setVolume(0.9);
    expect(getServerSnapshot()).toEqual({ enabled: false, volume: DEFAULT_VOLUME });
  });

  it("setEnabled aktualisiert den Zustand und benachrichtigt Abonnenten", () => {
    const listener = vi.fn();
    subscribe(listener);
    setEnabled(true);
    expect(getSnapshot().enabled).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("setEnabled ist ein No-op, wenn sich der Wert nicht ändert (kein unnötiges Schreiben/Benachrichtigen)", () => {
    const listener = vi.fn();
    subscribe(listener);
    setEnabled(false); // bereits der Default
    expect(listener).not.toHaveBeenCalled();
  });

  it("#DoD Lautstärke wird auf 0..1 begrenzt", () => {
    setVolume(5);
    expect(getSnapshot().volume).toBe(1);
    setVolume(-2);
    expect(getSnapshot().volume).toBe(0);
    setVolume(0.33);
    expect(getSnapshot().volume).toBe(0.33);
  });

  it("Einstellung wird gespeichert und beim Laden wiederhergestellt", () => {
    vi.useFakeTimers();
    setEnabled(true);
    setVolume(0.8);
    vi.advanceTimersByTime(300); // Storage-Drosselung (WRITE_THROTTLE_MS)

    // Neues "Laden": nur der Klang-Speicher wird zurückgesetzt, LocalStorage bleibt bestehen.
    __resetSoundStoreForTests();
    const restored = getSnapshot();
    expect(restored).toEqual({ enabled: true, volume: 0.8 });
    expect(loadPersisted().slices.soundPrefs).toEqual({ enabled: true, volume: 0.8 });
  });

  it("#DoD play() ist ein No-op, wenn Ton deaktiviert ist, und erzeugt keinen AudioContext", () => {
    const audioContextCtor = vi.fn();
    vi.stubGlobal("AudioContext", audioContextCtor);
    expect(getSnapshot().enabled).toBe(false);
    expect(() => play("click")).not.toThrow();
    expect(audioContextCtor).not.toHaveBeenCalled();
  });

  it("#DoD play() wirft nie, auch wenn Web Audio komplett fehlt (jsdom-Standardfall)", () => {
    setEnabled(true);
    // Kein Stub für window.AudioContext — das ist der reale jsdom-Zustand.
    expect(() => play("click")).not.toThrow();
  });

  it("play() wirft nie, auch wenn der AudioContext-Konstruktor selbst wirft", () => {
    setEnabled(true);
    class ThrowingAudioContext {
      constructor() {
        throw new Error("blockiert ohne Nutzergeste");
      }
    }
    vi.stubGlobal("AudioContext", ThrowingAudioContext);
    expect(() => play("click")).not.toThrow();
  });

  it("play() erzeugt einen AudioContext nur, wenn Ton aktiviert ist und ein Klang tatsächlich abgespielt wird", () => {
    class FakeGainNode {
      gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
      connect = vi.fn();
    }
    class FakeOscillatorNode {
      frequency = { setValueAtTime: vi.fn() };
      connect = vi.fn();
      start = vi.fn();
      stop = vi.fn();
    }
    class FakeAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      createGain = () => new FakeGainNode();
      createOscillator = () => new FakeOscillatorNode();
    }
    const ctor = vi.fn(function (this: unknown) {
      return Object.assign(this as object, new FakeAudioContext());
    });
    vi.stubGlobal("AudioContext", ctor);

    setEnabled(true);
    play("click");
    expect(ctor).toHaveBeenCalledTimes(1);

    // Ein zweiter Aufruf verwendet denselben Kontext (Wiederverwendung statt Neuanlage je Klang).
    play("click");
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("play() versucht einen aufgehängten Kontext freizugeben, wirft dabei aber nie, auch wenn resume() ablehnt", async () => {
    class FakeGainNode {
      gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
      connect = vi.fn();
    }
    class FakeOscillatorNode {
      frequency = { setValueAtTime: vi.fn() };
      connect = vi.fn();
      start = vi.fn();
      stop = vi.fn();
    }
    class FakeAudioContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      createGain = () => new FakeGainNode();
      createOscillator = () => new FakeOscillatorNode();
      resume = vi.fn(() => Promise.reject(new Error("nicht erlaubt")));
    }
    const ctor = vi.fn(function (this: unknown) {
      return Object.assign(this as object, new FakeAudioContext());
    });
    vi.stubGlobal("AudioContext", ctor);

    setEnabled(true);
    expect(() => play("click")).not.toThrow();
    // Die abgelehnte Promise wird intern abgefangen — nichts unhandled.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
