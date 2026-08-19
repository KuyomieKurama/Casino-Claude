"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { GameModeSummary } from "@/types/game-mode";
import { buttonClasses } from "@/components/ui/Button";
import { formatCredits } from "@/lib/formatters";
import { cn } from "@/lib/cn";

export type ModeSwitcherProps = {
  /** Alle Modi des Titels, inklusive des aktiven und inklusive inaktiver (Auftrag §3). */
  modes: readonly GameModeSummary[];
  activeModeId: string;
  titleLabel: string;
  /** true, während eine Runde läuft (roundStatus === "playing") — blockiert den Wechsel. */
  roundInProgress: boolean;
  /**
   * Kurzform des RTP des aktiven Modus (z. B. "97,30 %" oder "85,64 % – 98,94 %"), von
   * GameDetail berechnet (Etappe 2 §2: "RTP und Einsatzgrenzen wechseln sichtbar mit" — bei
   * Baccarat unterscheiden sich Wetten-RTPs deutlich, ein stiller Wechsel wäre irreführend).
   * Optional statt Pflicht, damit bestehende Aufrufer ohne RTP-Kontext (Tests, künftige
   * Verwendungen ohne Paytable-Zugriff) unverändert funktionieren — ohne den Wert bleibt nur
   * die Einsatzgrenze sichtbar.
   */
  activeRtpLabel?: string;
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
 *
 * RTP und Einsatzgrenzen wechseln sichtbar mit (Etappe 2 §2): eine knappe Kennzahlenzeile unter
 * den Modus-Buttons zeigt RTP (falls bekannt) und Einsatzgrenze des AKTIVEN Modus, mit
 * `.anim-state-pop` — derselbe federnde Pop wie beim aktiven Häkchen, kein Farbwechsel allein.
 * Da ein Moduswechsel hier immer über eine neue Route läuft (siehe oben), mountet dieser Absatz
 * bei jedem Wechsel ohnehin neu; `key={activeModeId}` macht die erneute Animation zusätzlich
 * unabhängig davon explizit, falls ModeSwitcher künftig ohne vollständigen Seitenwechsel
 * eingebunden wird.
 */
export function ModeSwitcher({ modes, activeModeId, titleLabel, roundInProgress, activeRtpLabel }: ModeSwitcherProps) {
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  // Titel mit nur einem Modus zeigen keine Modusauswahl (Auftrag §3).
  if (modes.length <= 1) return null;

  const activeMode = modes.find((mode) => mode.id === activeModeId);

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
              {isActive ? <Check className="anim-state-pop size-3.5 text-teal" aria-hidden="true" /> : null}
              {mode.label}
              {isActive ? <span className="sr-only"> (aktiver Modus)</span> : null}
            </Link>
          );
        })}
      </div>
      {activeMode ? (
        <p key={activeModeId} className="anim-state-pop tabular text-xs text-muted">
          {[
            activeRtpLabel ? `RTP ${activeRtpLabel}` : null,
            `Einsatz ${formatCredits(activeMode.minBetMinor)}–${formatCredits(activeMode.maxBetMinor)} Credits`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {blockedMessage ? (
        <p role="alert" className="text-sm text-warning">
          {blockedMessage}
        </p>
      ) : null}
    </div>
  );
}
