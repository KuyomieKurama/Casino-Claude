/**
 * Erzeugt einen neuen AudioContext, sofern der Browser Web Audio unterstützt. Reine
 * Fabrikfunktion ohne Modul-Zustand — die Instanz hält der Aufrufer
 * (components/sound/sound-store.ts), genau einmal pro Browser-Tab und erst nach dem ersten
 * tatsächlichen Abspielversuch (Auftrag §1: "erst nach einer Nutzergeste, nicht beim Laden").
 *
 * Safari nutzt teils noch das präfigierte `webkitAudioContext` statt des Standardnamens —
 * beide werden hier gleichwertig aufgelöst.
 */

type AudioContextConstructor = new () => AudioContext;

interface WindowWithWebkitAudio extends Window {
  // TypeScripts DOM-Lib deklariert AudioContext als globale Variable, nicht als Member des
  // Window-Interfaces — deshalb hier explizit (optional, da nicht jeder Browser sie hat).
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

function resolveAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as WindowWithWebkitAudio;
  return w.AudioContext ?? w.webkitAudioContext;
}

/**
 * null, wenn der Browser (oder jsdom in Tests) kein Web Audio unterstützt oder die Erzeugung
 * wirft (z. B. Browser-Richtlinie ohne vorausgehende Nutzergeste). Wirft selbst nie.
 */
export function createAudioContext(): AudioContext | null {
  const Ctor = resolveAudioContextConstructor();
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}
