/**
 * Verbindliche Schnittstelle der Klang-Infrastruktur (Auftrag „Klang-Infrastruktur"). `SoundName`
 * ist mit dem parallelen Engine-Auftrag abgestimmt und darf nicht umbenannt oder erweitert werden,
 * ohne den zweiten Agenten (Einbindung in components/game/**) abzustimmen.
 */
export type SoundName = "click" | "stop" | "card" | "chip" | "win" | "settle" | "error";

/** Persistierte Ton-Einstellung, Slice "soundPrefs" (lib/storage.ts). */
export type SoundSettings = {
  enabled: boolean;
  volume: number; // 0..1
};

/** Moderate Vorgabe-Lautstärke, bis der Nutzer sie ändert — weder unhörbar noch aufdringlich. */
export const DEFAULT_VOLUME = 0.5;

/** Ton ist erst nach ausdrücklicher Aktivierung hörbar (Regel 7 / Auftrag §2). */
export const DEFAULT_SOUND_SETTINGS: Readonly<SoundSettings> = { enabled: false, volume: DEFAULT_VOLUME };

/** Begrenzt einen Lautstärkewert auf den gültigen Bereich 0..1; ungültige Werte fallen auf den Default zurück. */
export function clampVolume(value: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}
