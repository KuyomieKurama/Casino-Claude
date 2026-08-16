"use client";

import { useCallback, useMemo } from "react";
import type { GameEngineViewProps } from "@/types/engine";
import { findPaytable } from "@/data/paytables";
import { resolveRound } from "@/lib/rng";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { useRound } from "@/components/game/engine/useRound";
import { GameShell } from "@/components/game/engine/GameShell";
import { cn } from "@/lib/cn";
import { gridForOutcome, reelStrip, themeFor, type ReelGrid, type SlotSymbolId } from "./symbols";
import { SlotSymbol } from "./SlotSymbol";

/**
 * Slot-Engine für alle elf Walzenspiele des Katalogs. Unterschieden werden die Spiele durch
 * ihre dokumentierte Auszahlungstabelle (data/paytables/slots.ts) und ihren Symbolsatz
 * (symbols.ts) — die Choreografie ist für alle dieselbe und kommt aus useRound + GameShell.
 *
 * Die Walzenzahl folgt der Beschreibung in data/games.ts: drei Walzen bei den als „klassisch“
 * ausgezeichneten Titeln, sonst fünf. Gewertet wird ausschließlich die mittlere Zeile.
 *
 * Bewusst NICHT vorhanden (Regel 7, siehe auch useRound und GameShell):
 *  - kein Autoplay, kein Turbospin — jede Runde ist ein expliziter Klick
 *  - kein Near Miss — Nullrunden zeigen ausschließlich verschiedene Symbole ohne Höchstwerte
 *  - kein Loss Disguised as Win — angezeigt wird die Nettoveränderung, nie eine Gewinnfanfare
 *  - keine vorausgewählte Bonusoption, kein Ton, Pause bleibt sichtbar
 */
export function SlotGame({ game, simulateLoadError = false, onStatusChange }: GameEngineViewProps) {
  const paytable = useMemo(() => findPaytable(game.id), [game.id]);
  const theme = useMemo(() => themeFor(game.id), [game.id]);

  const resolve = useCallback(
    ({ stakeMinor, seed }: { stakeMinor: number; seed: number }) => {
      // Ohne Tabelle wird keine Runde angeboten (siehe unten) — dieser Zweig ist reine Absicherung.
      if (!paytable) return { outcomeKey: "none", outcomeLabel: "Nullrunde", returnMinor: 0 };
      const { entry, returnMinor } = resolveRound(paytable, stakeMinor, seed);
      return { outcomeKey: entry.key, outcomeLabel: entry.label, returnMinor };
    },
    [paytable],
  );

  const round = useRound({ game, resolve, roundDurationMs: ROUND_DURATION_MS, simulateLoadError, onStatusChange });

  // Die Darstellung folgt dem Ergebnis: erst entscheidet die Tabelle, dann wird gerendert.
  const grid: ReelGrid = useMemo(
    () => (round.last ? gridForOutcome(game.id, round.last.outcomeKey, round.last.seed) : gridForOutcome(game.id, "none", 1)),
    [game.id, round.last],
  );

  if (!paytable) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface p-4 text-sm sm:p-6" role="note">
        <p className="font-medium text-primary">Für dieses Spiel ist keine Auszahlungstabelle hinterlegt.</p>
        <p className="text-muted">
          Ohne dokumentierte Tabelle wird keine Runde gestartet und kein RTP ausgewiesen (Regel 6). In der Lobby stehen die
          spielbaren Titel bereit.
        </p>
      </div>
    );
  }

  const compact = theme.reels === 5;

  return (
    <GameShell
      game={game}
      status={round.status}
      hydrated={round.hydrated}
      last={round.last}
      available={round.available}
      stake={round.stake}
      onStakeChange={round.setStake}
      onPlay={round.play}
      onRetryLoad={round.load}
      onTogglePause={round.togglePause}
      canStart={round.canStart}
      busy={round.busy}
      blocked={round.blocked}
      blockReason={round.blockReason}
      inlineErrorMessage={round.inlineError?.message}
      insufficient={round.insufficient}
      freeSpins={round.wallet.freeSpins}
      useFreeSpin={round.useFreeSpin}
      onUseFreeSpinChange={round.setUseFreeSpin}
    >
      <div className="relative mx-auto max-w-md">
        <h3 className="sr-only">Walzen</h3>
        {/* Die Ergebnisansage übernimmt die Ergebniszeile der Shell — hier kein zweiter Live-Bereich. */}
        <div
          role="group"
          aria-label={`${theme.reels} Walzen, gewertet wird die mittlere Zeile`}
          className={cn(
            "grid gap-1.5 rounded-card border border-border-control bg-base p-2 sm:gap-2 sm:p-3",
            compact ? "grid-cols-5" : "grid-cols-3",
          )}
        >
          {grid.map((reel, r) => (
            <Reel key={r} gameId={game.id} symbols={reel} spinning={round.status === "playing"} delayMs={r * 120} compact={compact} />
          ))}
          {/* Gewinnlinie: 1 px Gold, dezent — Signatur, kein Glühen */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-1/2 h-px bg-gold/60" />
        </div>
      </div>
    </GameShell>
  );
}

function Reel({
  gameId,
  symbols,
  spinning,
  delayMs,
  compact,
}: {
  gameId: string;
  symbols: SlotSymbolId[];
  spinning: boolean;
  delayMs: number;
  compact: boolean;
}) {
  const strip = useMemo(() => reelStrip(gameId), [gameId]);
  const size = compact ? "[&_svg]:size-6 sm:[&_svg]:size-8" : undefined;
  const cell = compact ? "h-10 sm:h-14" : "h-14 sm:h-[68px]";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-control border border-border-subtle bg-surface",
        compact ? "h-[120px] sm:h-[168px]" : "h-[168px] sm:h-[204px]",
      )}
    >
      {spinning ? (
        <div className="anim-reel flex flex-col items-center" style={{ animationDelay: `${delayMs}ms` }} aria-hidden="true">
          {strip.map((s, i) => (
            <span key={i} className={cn("flex items-center justify-center opacity-70", cell)}>
              <SlotSymbol id={s} className={size} />
            </span>
          ))}
        </div>
      ) : (
        <div className="anim-fade-in flex h-full flex-col items-center justify-around">
          {symbols.map((s, i) => (
            <span key={i} className={cn("flex items-center justify-center", cell, i !== 1 && "opacity-45")}>
              <SlotSymbol id={s} highlight={i === 1} className={size} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
