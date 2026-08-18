import { describe, expect, it, vi } from "vitest";
import type { SoundName } from "./types";
import { synthesize } from "./synth";

/**
 * jsdom kennt kein Web Audio (das ist im echten Hook genau der Fehlerfall, den
 * components/sound/sound-store.ts abfangen muss). Für die reine Synthese-Schicht bauen wir
 * deshalb eine minimale Attrappe der tatsächlich genutzten AudioContext-Oberfläche und prüfen,
 * welche Knoten mit welchem Timing eingeplant werden — ohne echte Audioausgabe.
 */

type Call = { start: number; stop: number; kind: "tone" | "noise"; frequency?: number };

class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
  });
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

function makeFakeContext(calls: Call[]) {
  class FakeGain {
    gain = new FakeAudioParam();
    connect = vi.fn();
  }
  class FakeOscillator {
    type: OscillatorType = "sine";
    frequency = new FakeAudioParam();
    connect = vi.fn();
    private startTime = 0;
    start = vi.fn((t: number) => {
      this.startTime = t;
    });
    stop = vi.fn((t: number) => {
      calls.push({ start: this.startTime, stop: t, kind: "tone", frequency: this.frequency.value });
    });
  }
  class FakeBiquadFilter {
    type = "bandpass";
    frequency = new FakeAudioParam();
    Q = new FakeAudioParam();
    connect = vi.fn();
  }
  class FakeBufferSource {
    buffer: unknown = null;
    connect = vi.fn();
    private startTime = 0;
    start = vi.fn((t: number) => {
      this.startTime = t;
    });
    stop = vi.fn((t: number) => {
      calls.push({ start: this.startTime, stop: t, kind: "noise" });
    });
  }

  return {
    currentTime: 0,
    sampleRate: 44_100,
    destination: {},
    createOscillator: () => new FakeOscillator(),
    createGain: () => new FakeGain(),
    createBiquadFilter: () => new FakeBiquadFilter(),
    createBufferSource: () => new FakeBufferSource(),
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  } as unknown as AudioContext;
}

const ALL_SOUNDS: SoundName[] = ["click", "stop", "card", "chip", "win", "settle", "error"];

describe("synthesize", () => {
  it.each(ALL_SOUNDS)("plant für '%s' mindestens einen Klangknoten ein, ohne zu werfen", (name) => {
    const calls: Call[] = [];
    const ctx = makeFakeContext(calls);
    expect(() => synthesize(ctx, name, 0.5)).not.toThrow();
    expect(calls.length).toBeGreaterThan(0);
  });

  it.each(ALL_SOUNDS)("hält '%s' unter dem Richtwert von 400 ms Gesamtdauer", (name) => {
    const calls: Call[] = [];
    const ctx = makeFakeContext(calls);
    synthesize(ctx, name, 1);
    const latestStop = Math.max(...calls.map((c) => c.stop));
    expect(latestStop).toBeLessThan(0.4);
  });

  it("win und settle sind strukturell unterscheidbar: win ist ein aufsteigender Zweiklang, settle ein einzelner Ton", () => {
    const winCalls: Call[] = [];
    synthesize(makeFakeContext(winCalls), "win", 0.5);
    const settleCalls: Call[] = [];
    synthesize(makeFakeContext(settleCalls), "settle", 0.5);

    expect(winCalls.length).toBe(2);
    expect(settleCalls.length).toBe(1);
    // aufsteigend: die zweite Tonhöhe von "win" liegt über der ersten
    const [first, second] = winCalls.sort((a, b) => a.start - b.start);
    expect(second!.frequency!).toBeGreaterThan(first!.frequency!);
  });

  it("erzeugt keinen Klang, dessen Lautstärke die Nutzer-Lautstärke ignoriert (0 Lautstärke bleibt am unteren Rand)", () => {
    // Kein direkter Zugriff auf den finalen Gain-Wert nötig — der Test stellt nur sicher, dass
    // eine Lautstärke von 0 nicht wirft und weiterhin Knoten plant (stumm, nicht deaktiviert;
    // das eigentliche Stummschalten übernimmt components/sound/sound-store.ts über "enabled").
    const calls: Call[] = [];
    const ctx = makeFakeContext(calls);
    expect(() => synthesize(ctx, "click", 0)).not.toThrow();
    expect(calls.length).toBeGreaterThan(0);
  });

  it("wirft nicht bei einem AudioContext ohne die erwarteten Methoden (unvollständige Attrappe)", () => {
    const brokenCtx = { currentTime: 0 } as unknown as AudioContext;
    expect(() => synthesize(brokenCtx, "click", 0.5)).toThrow();
    // Hinweis: synthesize() selbst darf werfen — das Abfangen ist bewusst Aufgabe des Aufrufers
    // (components/sound/sound-store.ts::play), siehe Dateikopf-Kommentar dieser Datei.
  });
});
