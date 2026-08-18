"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { GameModeSummary } from "@/types/game-mode";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type ModeSwitcherProps = {
  /** Alle Modi des Titels, inklusive des aktiven und inklusive inaktiver (Auftrag §3). */
  modes: readonly GameModeSummary[];
  activeModeId: string;
  titleLabel: string;
  /** true, während eine Runde läuft (roundStatus === "playing") — blockiert den Wechsel. */
  roundInProgress: boolean;
};

/**
 * Moduswechsel auf der Spieldetailseite (Auftrag §3): Umriss-Bedienelemente, nie `bg-gold`
 * ("Gold bleibt knapp" — die eine goldene Fläche gehört der Hauptaktion). Der Wechsel navigiert
 * direkt zur Route des Zielmodus (bestehende Modus-URLs bleiben dadurch gültig, siehe
 * app/game/[slug]/page.tsx), ohne Umweg über die Lobby.
 *
 * Aktiver Zustand nie allein über Farbe: Häkchen-Icon + `aria-current="page"` + sichtbarer
 * Text ("aktiver Modus" für Screenreader). Ein deaktivierter Modus wird als Button ohne Ziel
 * gerendert statt versteckt — sichtbar, aber nicht bedienbar.
 */
export function ModeSwitcher({ modes, activeModeId, titleLabel, roundInProgress }: ModeSwitcherProps) {
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  // Titel mit nur einem Modus zeigen keine Modusauswahl (Auftrag §3).
  if (modes.length <= 1) return null;

  return (
    <div className="space-y-2">
      <h2 id="mode-switcher-heading" className="text-sm font-medium text-muted">
        {titleLabel}: Modus wählen
      </h2>
      <div role="group" aria-labelledby="mode-switcher-heading" className="flex flex-wrap gap-2">
        {modes.map((mode) => {
          const isActive = mode.id === activeModeId;
          const isAvailable = mode.status === "active";

          if (!isAvailable) {
            return (
              <button
                key={mode.id}
                type="button"
                disabled
                aria-disabled="true"
                aria-label={`Modus ${mode.label}, zurzeit nicht verfügbar`}
                className={buttonClasses({ variant: "outline", size: "md" })}
              >
                {mode.label}
                <span className="text-xs">(nicht verfügbar)</span>
              </button>
            );
          }

          return (
            <Link
              key={mode.id}
              href={`/game/${mode.slug}`}
              aria-current={isActive ? "page" : undefined}
              aria-label={isActive ? `Modus ${mode.label}, aktiver Modus` : `Zu Modus ${mode.label} wechseln`}
              className={cn(
                buttonClasses({ variant: "outline", size: "md" }),
                "focus-glow",
                isActive && "border-teal text-primary",
              )}
              onClick={(event) => {
                if (isActive) {
                  event.preventDefault();
                  return;
                }
                if (roundInProgress) {
                  event.preventDefault();
                  setBlockedMessage(
                    `Moduswechsel ist während einer laufenden Runde nicht möglich. Runde zuerst abschließen, dann zu „${mode.label}" wechseln.`,
                  );
                  return;
                }
                setBlockedMessage(null);
              }}
            >
              {isActive ? <Check className="size-3.5 text-teal" aria-hidden="true" /> : null}
              {mode.label}
              {isActive ? <span className="sr-only"> (aktiver Modus)</span> : null}
            </Link>
          );
        })}
      </div>
      {blockedMessage ? (
        <p role="alert" className="text-sm text-warning">
          {blockedMessage}
        </p>
      ) : null}
    </div>
  );
}
