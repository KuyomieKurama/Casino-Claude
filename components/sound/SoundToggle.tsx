"use client";

import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSound } from "./useSound";

export type SoundToggleProps = {
  /**
   * "icon": kompakt für die Kopfzeile — nur Icon, Name über aria-label (wie die anderen
   * Icon-Bedienelemente dort, z. B. Abmelden/Admin-Zugang).
   * "labeled": mit sichtbarem Text für die Einstellungen — der Zustand ist damit auch ohne
   * Screenreader eindeutig ablesbar, nicht nur über die Icon-Form.
   */
  variant?: "icon" | "labeled";
  className?: string;
};

/**
 * Ton-Umschalter. Zustand ist nie allein über Farbe erkennbar: Das Icon wechselt strukturell
 * (Volume2 ↔ VolumeX, nicht nur eingefärbt) UND aria-checked wechselt mit, in der
 * "labeled"-Variante zusätzlich ein sichtbarer Text. role="switch" beschreibt einen sofortigen
 * Ein/Aus-Effekt (kein role="checkbox", das wäre eine Formularauswahl). Ein natives <button> ist
 * ohne weiteres Zutun mit Enter und Leertaste bedienbar; die Größe hält in beiden Varianten das
 * 44×44-px-Touch-Ziel ein.
 */
export function SoundToggle({ variant = "icon", className }: SoundToggleProps) {
  const { enabled, setEnabled } = useSound();
  const Icon = enabled ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Ton"
      onClick={() => setEnabled(!enabled)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-control transition-state",
        variant === "icon"
          ? cn("size-11 text-muted hover:bg-surface hover:text-primary", enabled && "text-accent")
          : cn(
              "h-11 min-w-11 border border-border-control px-3 text-sm font-medium text-primary hover:border-gold-strong/70",
              enabled && "border-accent text-accent",
            ),
        className,
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {variant === "labeled" ? (
        <>
          <span>{enabled ? "Ton ein" : "Ton aus"}</span>
          {/* Zusätzlich zu Icon-Wechsel und Text: ein kleiner Statuspunkt, rein dekorativ
              (aria-hidden) — macht den Schaltzustand auch auf einen Blick von der Seite
              erkennbar, ohne selbst Bedeutungsträger zu sein (§12: Status nie nur über Farbe). */}
          <span
            aria-hidden="true"
            className={cn("size-2 shrink-0 rounded-pill transition-state", enabled ? "bg-accent" : "border border-border-control bg-transparent")}
          />
        </>
      ) : null}
    </button>
  );
}
