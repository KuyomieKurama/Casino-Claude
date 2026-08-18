import { loadPersisted, writeSlice } from "@/lib/storage";
import { clampVolume, DEFAULT_SOUND_SETTINGS, type SoundName, type SoundSettings } from "@/lib/sound/types";
import { synthesize } from "@/lib/sound/synth";
import { createAudioContext } from "./audio-context";

/**
 * Modul-weiter Klang-Speicher: eine Instanz pro Browser-Tab, geteilt zwischen allen
 * Aufrufstellen von useSound() (Kopfzeile, Einstellungen, künftig die Spiel-Engines) — als
 * einfacher Modul-Singleton statt eines React-Context. Grund: `state/**` ist für diesen Auftrag
 * gesperrt (Dateiabgrenzung), ein Context-Provider dort hätte nicht angebunden werden können.
 * components/sound/useSound.ts liest diesen Speicher über React 19s useSyncExternalStore.
 */

let snapshot: SoundSettings = DEFAULT_SOUND_SETTINGS;
let hydrated = false;
let audioContext: AudioContext | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function isSoundSettings(value: unknown): value is SoundSettings {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SoundSettings>;
  return typeof candidate.enabled === "boolean" && typeof candidate.volume === "number";
}

/**
 * Liest die persistierte Einstellung genau einmal pro Modul-Lebenszeit nach. Läuft lazy beim
 * ersten tatsächlichen Zugriff (nicht beim Import), damit ein Server-Render (kein `window`) beim
 * dokumentierten Default bleibt — siehe getServerSnapshot().
 */
function hydrateIfNeeded(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  const { slices } = loadPersisted();
  if (isSoundSettings(slices.soundPrefs)) {
    snapshot = { enabled: slices.soundPrefs.enabled, volume: clampVolume(slices.soundPrefs.volume) };
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): SoundSettings {
  hydrateIfNeeded();
  return snapshot;
}

/** Serverseitiger/anfänglicher Zustand — immer der dokumentierte Default (Ton aus). */
export function getServerSnapshot(): SoundSettings {
  return DEFAULT_SOUND_SETTINGS;
}

function persist(): void {
  writeSlice("soundPrefs", snapshot);
}

export function setEnabled(on: boolean): void {
  hydrateIfNeeded();
  if (snapshot.enabled === on) return;
  snapshot = { ...snapshot, enabled: on };
  persist();
  notify();
}

export function setVolume(value: number): void {
  hydrateIfNeeded();
  const volume = clampVolume(value);
  if (snapshot.volume === volume) return;
  snapshot = { ...snapshot, volume };
  persist();
  notify();
}

/**
 * Spielt den benannten Klang ab. Nie werfend: deaktivierter Ton, fehlendes Web Audio (jsdom,
 * ältere Browser) und ein blockierter oder aufgehängter Kontext führen höchstens zu Stille, nie
 * zu einem Fehler oder einer blockierten Runde (Auftrag §1).
 *
 * Der AudioContext entsteht lazily genau hier, beim ersten tatsächlichen Abspielversuch — nicht
 * beim Laden — und nur, wenn Ton aktiviert ist. Ist Ton deaktiviert, wird keine AudioContext-
 * Instanz erzeugt (Auftrag §1/§2, Definition of Done).
 */
export function play(name: SoundName): void {
  try {
    hydrateIfNeeded();
    if (!snapshot.enabled) return;
    if (!audioContext) audioContext = createAudioContext();
    if (!audioContext) return;
    if (audioContext.state === "suspended") {
      // resume() ist selbst asynchron; das Ergebnis wird bewusst nicht abgewartet — schlägt es
      // fehl, bleibt es bei Stille für diesen einen Aufruf, nie bei einem geworfenen Fehler.
      void audioContext.resume().catch(() => undefined);
    }
    synthesize(audioContext, name, snapshot.volume);
  } catch {
    // Web Audio kann aus vielen Gründen werfen (kein Support, geschlossener Kontext, Browser-
    // Richtlinie). Ein Klang ist nie kritisch für den Spielablauf — deshalb hier immer schlucken.
  }
}

/** Nur für Tests: setzt den Modul-Zustand zurück (Vorbild: lib/storage.ts::__resetStorageForTests). */
export function __resetSoundStoreForTests(): void {
  snapshot = DEFAULT_SOUND_SETTINGS;
  hydrated = false;
  audioContext = null;
  listeners.clear();
}
