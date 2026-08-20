"use client";

import { useId } from "react";
import { Card } from "@/components/ui/Card";
import { SoundToggle } from "./SoundToggle";
import { useSound } from "./useSound";

/**
 * Ausführliche Ton-Einstellung für den Nutzerbereich (components/user/SettingsPage.tsx):
 * Ein/Aus-Umschalter, Lautstärkeregler, Erklärung des Opt-in-Charakters. Der kompakte Umschalter
 * in der Kopfzeile (components/layout/Header.tsx) nutzt dieselbe Logik über useSound() — beide
 * Stellen teilen sich denselben Modul-Speicher (components/sound/sound-store.ts), ein Wechsel an
 * einer Stelle wirkt sofort an der anderen.
 */
export function SoundSettingsSection() {
  const { enabled, volume, setVolume } = useSound();
  const volumeId = useId();
  const volumePercent = Math.round(volume * 100);

  return (
    <Card as="section" aria-labelledby="sound-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 id="sound-title" className="text-md font-semibold text-primary">
            Ton
          </h2>
          <p className="measure text-sm text-muted">
            Dezente, synthetisierte Klänge für Interaktionen — standardmäßig aus, nur nach
            ausdrücklicher Aktivierung hörbar. Ein zurückhaltender Klang bei echtem Netto-Gewinn
            und ein neutraler Klang beim Rundenabschluss ohne Gewinn beschönigen den Ausgang nie.
          </p>
        </div>
        <SoundToggle variant="labeled" />
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label htmlFor={volumeId} className="text-sm font-medium text-primary">
          Lautstärke
        </label>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={volumePercent}
          disabled={!enabled}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
          aria-valuetext={`${volumePercent} Prozent`}
          className="h-11 w-full accent-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-sm text-muted" aria-hidden="true">
          {volumePercent} %
        </p>
      </div>
    </Card>
  );
}
