"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Minus, Pause, Play, Plus, ShieldAlert } from "lucide-react";
import type { Game } from "@/types/game";
import type { RoundStatus } from "@/types/game-round";
import { rgReasonText, type RgBlockReason } from "@/state/rg-reducer";
import { formatCredits, formatCreditsSigned, formatCreditsWithUnit } from "@/lib/formatters";
import { Button, LinkButton } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/feedback/ErrorState";
import { cn } from "@/lib/cn";
import type { LastRoundResult } from "./useRound";
import { useSound } from "./sound/useEngineSound";

/** Feste Einsatzstufen; jede Engine filtert auf ihren erlaubten Einsatzbereich. */
export const STAKE_PRESETS = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000] as const;

export function stakeOptionsFor(game: Game): number[] {
  const inRange = STAKE_PRESETS.filter((s) => s >= game.minDemoBetMinor && s <= game.maxDemoBetMinor);
  return inRange.length ? [...inRange] : [game.minDemoBetMinor];
}

export type GameShellProps = {
  game: Game;
  status: RoundStatus;
  hydrated: boolean;
  /** Spielfläche der Engine (Walzen, Tisch, Raster …). */
  children: ReactNode;
  /** Zusätzliche Bedienelemente über dem Einsatzbereich (Wettauswahl, Aktionen). */
  controls?: ReactNode;
  /** Ersetzt den Start-Button, z. B. bei interaktiven Runden mit eigenen Aktionen. */
  primaryAction?: ReactNode;
  last: LastRoundResult | null;
  available: number;
  stake: number;
  onStakeChange: (value: number) => void;
  onPlay?: () => void;
  onRetryLoad: () => void;
  onTogglePause: () => void;
  canStart: boolean;
  busy: boolean;
  blocked: boolean;
  blockReason?: RgBlockReason;
  inlineErrorMessage?: string;
  insufficient: boolean;
  freeSpins: number;
  useFreeSpin: boolean;
  onUseFreeSpinChange: (value: boolean) => void;
  /** Text des Start-Buttons; Standard „Runde starten“. */
  startLabel?: string;
  /** Kontexthinweis vor der Aktion. */
  actionHint?: ReactNode;
  /** Einsatz während einer offenen interaktiven Runde sperren. */
  stakeLocked?: boolean;
};

/**
 * Geteilte Hülle für alle Spiel-Engines: Kopfzeile mit Spieltitel und Pause,
 * Spielfläche, Netto-Ergebnisanzeige, Einsatzsteuerung mit Inline-Fehler, RG-Sperre sowie
 * Lade- und Fehlerzustand. Alle sieben RoundStatus-Werte haben hier eine eigene Darstellung.
 *
 * Bewusst NICHT vorhanden (Regel 7): kein Autoplay, kein Turbospin, keine Gewinnfanfare bei
 * Rückgabe unter Einsatz, keine vorausgewählte Bonusoption, keine versteckte Pause.
 *
 * Klang (Auftrag „Sound-Integration"): Die Einsatzsteuerung ist die einzige Bedienung, die für
 * ALLE Engines hier in der Shell liegt (+/- Buttons) — deshalb löst ausschließlich sie hier
 * zentral "chip" aus, statt das in jeder Engine zu wiederholen. Alle übrigen Klänge (Gewinn/
 * Verlust, Spieleraktionen, Kartenausgabe, Rad-/Walzenstopp, Fehler) bleiben Sache der jeweiligen
 * Engine — diese Datei kennt weder Rundenergebnis noch Spielaktionen und rührt beides nicht an.
 */
export function GameShell(props: GameShellProps) {
  const {
    game, status, hydrated, children, controls, primaryAction, last, available, stake, onStakeChange,
    onPlay, onRetryLoad, onTogglePause, canStart, busy, blocked, blockReason, inlineErrorMessage,
    insufficient, freeSpins, useFreeSpin, onUseFreeSpinChange, startLabel = "Runde starten", actionHint, stakeLocked,
  } = props;

  const options = stakeOptionsFor(game);
  const index = options.indexOf(stake);
  const { play } = useSound();

  if (status === "loading" || status === "idle" || !hydrated) {
    return (
      <div aria-busy="true" aria-live="polite" className="rounded-card border border-border-subtle bg-surface p-4 sm:p-6">
        <span className="sr-only">Spiel wird geladen …</span>
        <Skeleton className="mx-auto h-[220px] w-full max-w-md rounded-card" />
        <div className="mx-auto mt-4 grid max-w-md grid-cols-3 gap-2">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <ErrorState
        title="Das Spiel konnte nicht geladen werden."
        text="Der Spieldienst hat nicht geantwortet. Es wurde kein Guthaben bewegt. Du kannst es erneut versuchen."
        onRetry={onRetryLoad}
        extra={<LinkButton href="/casino" variant="ghost">Zur Lobby</LinkButton>}
      />
    );
  }

  const reason = blocked && blockReason ? rgReasonText[blockReason] : null;
  const changeStake = (dir: 1 | -1) => {
    const i = index === -1 ? 0 : index;
    const next = options[Math.min(options.length - 1, Math.max(0, i + dir))];
    if (next !== undefined && next !== stake) {
      onStakeChange(next);
      play("chip"); // Einsatz geändert — die einzige stake-ändernde Bedienung, die in der Shell liegt
    }
  };

  return (
    // Etappe 2 (Gestaltung/Bewegung, s. Auftrag): space-y-lg statt space-y-4 und p-md/sm:p-lg statt
    // p-4/sm:p-6 — großzügige Abstände AUS DER SKALA (--space-*) zwischen den drei Zonen Kopfzeile/
    // Spielfläche+Ergebnis/Einsatzbereich, siehe die border-t-Trenner unten. Rundenchoreografie,
    // Wallet-Anbindung, RoundStatus-Werte und Klang-Auslöser bleiben unverändert — nur Klassen.
    <div className="min-w-0 space-y-lg overflow-x-clip rounded-card border border-border-subtle bg-surface p-md sm:p-lg" data-status={status}>
      {/* Kopfzeile: eigene Zone mit Trennlinie darunter statt reiner Abstandsvererbung — macht die
          drei geforderten Zonen (Kopf/Spielfläche+Ergebnis/Einsatzbereich) sichtbar, nicht nur
          per Whitespace erahnbar. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-md">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg text-primary">{game.name}</h2>
        </div>
        <Button
          variant="ghost"
          onClick={onTogglePause}
          disabled={busy || blocked}
          iconLeft={status === "paused" ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
          aria-pressed={status === "paused"}
        >
          {status === "paused" ? "Fortsetzen" : "Pause"}
        </Button>
      </div>

      {/* Mittelzone: Spielfläche + Ergebniszeile + RG-Grund, mit unveränderter interner
          Abstandsdichte (space-y-4) — nur als eigene Zone gruppiert, keine Kind-Reihenfolge oder
          -Logik geändert. */}
      <div className="space-y-4">
        <div className={cn("relative", status === "paused" && "opacity-40")}>{children}</div>

        {status === "paused" ? (
          <div className="rounded-control border border-border-control bg-elevated px-4 py-3 text-center">
            <p className="text-sm font-medium text-primary">Pause</p>
            <p className="text-xs text-muted">Das Guthaben bleibt unverändert.</p>
          </div>
        ) : null}

        {/* Ergebnis: netto, ohne Fanfare. aria-live="polite" unverändert (nicht doppeln, siehe
            Auftrag). Neu: .anim-state-pop auf der Ergebniskarte, GLEICH für jedes Ergebnis (Gewinn,
            Verlust, Push) — macht den Wechsel wahrnehmbar, ohne ihn zu werten: keine eigene
            Gewinn-Variante, kein Aufblitzen, keine Betonung. key=last.roundId löst die Animation
            bei jedem neuen Ergebnis erneut aus (unter prefers-reduced-motion nur Deckkraft, siehe
            app/globals.css). */}
        <div className="mx-auto min-h-[3.5rem] max-w-md text-center" aria-live="polite" aria-atomic="true">
          {status === "playing" ? (
            <p className="text-sm text-muted">Runde läuft …</p>
          ) : last ? (
            <div key={last.roundId} className="anim-state-pop rounded-control border border-border-subtle bg-base px-3 py-2">
              <p className="text-sm text-muted">
                {last.outcomeLabel}
                {last.usedFreeSpin ? " (Freirunde)" : ""} · Rückgabe {formatCreditsWithUnit(last.returnMinor)}
              </p>
              <p className={cn("tabular text-lg font-semibold", last.netMinor > 0 ? "text-success" : "text-primary")}>
                {formatCreditsSigned(last.netMinor)} <span className="text-sm font-normal text-muted">Credits</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Bereit. Einsatz wählen und Runde starten.</p>
          )}
        </div>

        {reason ? (
          <div role="alert" className="mx-auto flex max-w-md items-start gap-3 rounded-control border border-warning/60 bg-base p-3 text-sm">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium text-primary">{reason.title}</p>
              <p className="text-muted">{reason.body}</p>
              <Link href="/responsible-gaming" className="mt-1 inline-flex min-h-11 items-center font-medium text-gold hover:text-gold-strong">
                Zu Responsible Gaming
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {/* Einsatzbereich: eigene Zone, per border-t + pt-lg (Skala) von der Mittelzone abgesetzt. */}
      <div className="mx-auto max-w-md space-y-3 border-t border-border-subtle pt-lg">
        {controls}

        <div className="flex items-center justify-between gap-2">
          <span id="stake-label" className="text-sm font-medium text-primary">
            Einsatz pro Runde
          </span>
          <span className="tabular text-sm text-muted">Verfügbar: {formatCredits(available)} Credits</span>
        </div>
        <div className="flex items-center gap-2" role="group" aria-labelledby="stake-label">
          <Button variant="outline" onClick={() => changeStake(-1)} disabled={busy || stakeLocked || index <= 0} aria-label="Einsatz verringern" iconLeft={<Minus className="size-4" aria-hidden="true" />} />
          <output
            className={cn(
              "tabular flex h-11 flex-1 items-center justify-center rounded-control border bg-base text-base font-semibold text-primary",
              inlineErrorMessage || insufficient ? "border-danger" : "border-border-control",
            )}
            aria-describedby={inlineErrorMessage || insufficient ? "stake-error" : undefined}
          >
            {formatCredits(stake)} <span className="ml-1 text-sm font-normal text-muted">Credits</span>
          </output>
          <Button variant="outline" onClick={() => changeStake(1)} disabled={busy || stakeLocked || index >= options.length - 1} aria-label="Einsatz erhöhen" iconLeft={<Plus className="size-4" aria-hidden="true" />} />
        </div>
        <p className="text-xs text-muted">
          Einsatzbereich: {formatCredits(game.minDemoBetMinor)} – {formatCredits(game.maxDemoBetMinor)} Credits
        </p>

        {freeSpins > 0 ? (
          <Checkbox
            label={`Freirunde einsetzen (${freeSpins} übrig) — kein Einsatz vom Guthaben`}
            checked={useFreeSpin}
            onChange={(e) => onUseFreeSpinChange(e.target.checked)}
            disabled={busy || stakeLocked}
          />
        ) : null}

        {inlineErrorMessage || insufficient ? (
          <p id="stake-error" role="alert" className="text-sm text-danger">
            {inlineErrorMessage ?? "Dein Guthaben reicht für diese Runde nicht aus. Setze es zurück oder füge Credits hinzu."}
          </p>
        ) : null}

        <p className="text-xs text-muted">
          {actionHint ?? (
            <>
              Startet eine Runde und zieht {useFreeSpin ? "eine Freirunde" : `${formatCreditsWithUnit(stake)} Guthaben`} ab. Kein Echtgeld.
            </>
          )}
        </p>

        {primaryAction ?? (
          // .press-feedback (Auftrag: "Der Startknopf zeigt Druckfeedback"): nur am Default-Button,
          // den Engines mit eigenem primaryAction (Blackjack, Mines, Video Poker) nicht verwenden —
          // ihre Buttons bleiben unangetastet. Der Sperrzustand während der Runde kommt unverändert
          // aus useRound (disabled={!canStart}, loading-Spinner, Text "Runde läuft").
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="press-feedback"
            onClick={onPlay}
            disabled={!canStart}
            loading={status === "playing"}
            iconLeft={<Play className="size-4" aria-hidden="true" />}
          >
            {status === "playing" ? "Runde läuft" : startLabel}
          </Button>
        )}

        {last ? (
          <p className="tabular text-center text-xs text-muted">
            Runde {last.roundId.slice(2, 10)} · Seed {last.seed} · Ergebnisklasse „{last.outcomeLabel}“ — reproduzierbar über die Auszahlungstabelle.
          </p>
        ) : null}
      </div>
    </div>
  );
}
