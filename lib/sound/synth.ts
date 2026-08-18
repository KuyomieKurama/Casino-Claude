import type { SoundName } from "./types";

/**
 * Reine Synthese-Schicht: erzeugt Casino-Klänge zur Laufzeit über die Web Audio API — keine
 * Audiodateien, keine neue Abhängigkeit (vermeidet Assets und Lizenzfragen, hält den Klang
 * konsistent). Jede Funktion plant Knoten auf dem übergebenen AudioContext ein und kehrt sofort
 * zurück; sie hält selbst keinen Zustand (kein Modul-Singleton, kein React) und öffnet/schließt
 * auch keinen Kontext — das liegt bei components/sound/sound-store.ts.
 *
 * Web-Audio-Aufrufe können selbst werfen (z. B. bei bereits geschlossenem Kontext). Das Abfangen
 * liegt bewusst beim Aufrufer, der jeden play()-Versuch einmalig kapselt, statt es hier pro
 * Klangbaustein zu wiederholen.
 */

/** Deckelt die Spitzenlautstärke aller Klänge zusätzlich zur Nutzer-Lautstärke — auch bei voller Reglerstellung bleibt es zurückhaltend. */
const MASTER_PEAK = 0.22;

/** Kurzer, kleiner Attack verhindert ein hörbares Knacken beim Einsetzen des Tons. */
const ATTACK_S = 0.008;

/** Sicherheitsabstand zwischen geplantem Ausklingen (Gain nähert sich 0) und tatsächlichem stop(). */
const RELEASE_TAIL_S = 0.02;

function tone(ctx: AudioContext, start: number, freq: number, durationS: number, volume: number, type: OscillatorType, peak: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  const peakGain = Math.max(peak * MASTER_PEAK * volume, 0.0001);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + ATTACK_S);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationS + RELEASE_TAIL_S);
}

/** Gefiltertes Rauschen für perkussive, nicht-tonale Klänge (Kartenlegen, Walzenstopp). */
function noiseBurst(ctx: AudioContext, start: number, durationS: number, volume: number, filterFreq: number, q: number, peak: number): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationS));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = q;

  const gain = ctx.createGain();
  const peakGain = Math.max(peak * MASTER_PEAK * volume, 0.0001);
  gain.gain.setValueAtTime(peakGain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationS);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
  source.stop(start + durationS + RELEASE_TAIL_S);
}

/** Knopfdruck: kurzer, heller Klick. */
function playClick(ctx: AudioContext, start: number, volume: number): void {
  tone(ctx, start, 1200, 0.05, volume, "square", 0.7);
}

/** Walzen-/Radstopp: spürbarer, tiefer Impuls (Rauschen + Ton) — kein eskalierender Spannungsklang während der Runde, nur der Stopp selbst. */
function playStop(ctx: AudioContext, start: number, volume: number): void {
  noiseBurst(ctx, start, 0.05, volume, 260, 1.1, 1);
  tone(ctx, start, 140, 0.09, volume, "sine", 0.85);
}

/** Kartenlegen: kurzes, trockenes Schnappen. */
function playCard(ctx: AudioContext, start: number, volume: number): void {
  noiseBurst(ctx, start, 0.045, volume, 2200, 2.6, 0.75);
}

/** Einsatz gesetzt: zwei sehr kurze, helle Klicks (Chip-Klacken). */
function playChip(ctx: AudioContext, start: number, volume: number): void {
  tone(ctx, start, 1800, 0.03, volume, "square", 0.55);
  tone(ctx, start + 0.045, 1500, 0.035, volume, "square", 0.5);
}

/**
 * Echter Netto-Gewinn: zurückhaltender, aufsteigender Zweiklang statt Jubel. Bewusst kein
 * Loss-Disguised-as-Win-Klang — dieser Klang darf nur bei tatsächlichem Netto-Gewinn ausgelöst
 * werden, das entscheidet der Aufrufer (Engine bzw. useRound-Integration), nicht diese Funktion.
 */
function playWin(ctx: AudioContext, start: number, volume: number): void {
  tone(ctx, start, 660, 0.12, volume, "sine", 0.75);
  tone(ctx, start + 0.09, 880, 0.16, volume, "sine", 0.85);
}

/** Rundenabschluss ohne Gewinn: ein einzelner, gleichbleibender Ton — neutral, weder feiernd noch bedrückend. */
function playSettle(ctx: AudioContext, start: number, volume: number): void {
  tone(ctx, start, 440, 0.14, volume, "sine", 0.6);
}

/** Abgelehnte Aktion: zwei kurze, tiefe Töne — von "click" klar unterscheidbar, ohne unangenehm zu wirken. */
function playError(ctx: AudioContext, start: number, volume: number): void {
  tone(ctx, start, 220, 0.08, volume, "triangle", 0.7);
  tone(ctx, start + 0.09, 165, 0.09, volume, "triangle", 0.6);
}

/**
 * Plant den benannten Klang auf dem übergebenen Kontext ein. Alle Klänge bleiben deutlich unter
 * 400 ms Gesamtdauer (Richtwert aus dem Auftrag).
 */
export function synthesize(ctx: AudioContext, name: SoundName, volume: number): void {
  const now = ctx.currentTime;
  switch (name) {
    case "click":
      playClick(ctx, now, volume);
      return;
    case "stop":
      playStop(ctx, now, volume);
      return;
    case "card":
      playCard(ctx, now, volume);
      return;
    case "chip":
      playChip(ctx, now, volume);
      return;
    case "win":
      playWin(ctx, now, volume);
      return;
    case "settle":
      playSettle(ctx, now, volume);
      return;
    case "error":
      playError(ctx, now, volume);
      return;
  }
}
