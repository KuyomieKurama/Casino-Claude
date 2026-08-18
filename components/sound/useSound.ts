"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { SoundName } from "@/lib/sound/types";
import { getServerSnapshot, getSnapshot, play as playSound, setEnabled as storeSetEnabled, setVolume as storeSetVolume, subscribe } from "./sound-store";

export type UseSoundResult = {
  play: (name: SoundName) => void;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
};

/**
 * Client-Hook für Ton (verbindliche Schnittstelle, siehe Auftrag „Klang-Infrastruktur"). Liefert
 * die aus lib/storage.ts wiederhergestellte Einstellung und eine niemals werfende
 * Abspielfunktion. `play` ist auch dann gefahrlos aufrufbar, wenn Ton aus ist, der Browser Audio
 * blockiert oder noch kein AudioContext existiert — die gesamte Fehlerbehandlung liegt in
 * components/sound/sound-store.ts.
 *
 * Zustand ist ein Modul-Singleton (sound-store.ts), geteilt über React 19s
 * useSyncExternalStore statt eines React-Context — state/** ist für diesen Auftrag gesperrt
 * (Dateiabgrenzung), ein Provider dort wäre nicht erreichbar gewesen. getServerSnapshot sorgt
 * dafür, dass ein serverseitig gerenderter Erstzustand immer beim dokumentierten Default (Ton
 * aus) bleibt, unabhängig von einer lokal bereits gespeicherten Einstellung.
 */
export function useSound(): UseSoundResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const play = useCallback((name: SoundName) => {
    playSound(name);
  }, []);
  const setEnabled = useCallback((on: boolean) => {
    storeSetEnabled(on);
  }, []);
  const setVolume = useCallback((v: number) => {
    storeSetVolume(v);
  }, []);

  return { play, enabled: snapshot.enabled, setEnabled, volume: snapshot.volume, setVolume };
}
