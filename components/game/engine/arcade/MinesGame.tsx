"use client";

import { useCallback, useEffect, useState } from "react";
import { Bomb, Check, Play } from "lucide-react";
import type { GameEngineViewProps } from "@/types/engine";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { formatCreditsWithUnit } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { GameShell } from "../GameShell";
import { useRound } from "../useRound";
import {
  MINES_CELLS,
  MINES_COUNTS,
  MINES_DEFAULT_COUNT,
  MINES_GRID_SIZE,
  minesBetId,
  minesLadder,
  minesMultiplier,
  minesReturnMinor,
  parseMinesDetail,
  startMinesRound,
  type MinesCount,
} from "./mines-logic";

/**
 * Mines Demo — Oberfläche, interaktiv.
 *
 * Der Ausgang steht erst am Ende fest, deshalb `useRound({ interactive: true })`: beim Start wird
 * die Obergrenze der Rückgabe deklariert (alle sicheren Felder aufgedeckt), und der Wallet-Reducer
 * akzeptiert beim Abschluss nur Beträge bis dahin. Die Oberfläche kann keinen Betrag erfinden.
 *
 * Die Minen kommen aus dem Rundenseed und stehen vor dem ersten Klick fest — sie werden hier
 * einmal beim Start aus dem EngineOutcome gelesen und danach nie mehr verändert.
 *
 * Bewusst NICHT vorhanden (Regel 7): kein Autoplay, keine Wiederhol-Automatik, kein Ton,
 * keine Strategiehinweise („jetzt aufhören“), keine Feier bei Rückgabe unter Einsatz.
 * Farbe trägt nie allein: jedes Feld hat Symbol und Text.
 */
export function MinesGame({ game, simulateLoadError = false, onStatusChange }: GameEngineViewProps) {
  const [mineCount, setMineCount] = useState<MinesCount>(MINES_DEFAULT_COUNT);
  const [positions, setPositions] = useState<number[] | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [hitCell, setHitCell] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const resolve = useCallback(
    ({ stakeMinor, seed, betId }: { stakeMinor: number; seed: number; betId?: string }) => startMinesRound(stakeMinor, seed, betId),
    [],
  );

  const round = useRound({
    game,
    resolve,
    roundDurationMs: ROUND_DURATION_MS,
    interactive: true,
    simulateLoadError,
    ...(onStatusChange ? { onStatusChange } : {}),
  });

  const { setBetId } = round;
  useEffect(() => {
    setBetId(minesBetId(mineCount));
  }, [mineCount, setBetId]);

  const safeCells = MINES_CELLS - mineCount;
  const currentMultiplier = minesMultiplier(mineCount, revealed.length);
  const cashOutMinor = minesReturnMinor(round.stake, mineCount, revealed.length);
  const finished = !open && positions !== null;

  const startRound = () => {
    const started = round.start();
    if (!started) return;
    const detail = parseMinesDetail(started.outcome.detail);
    if (!detail) return;
    setPositions(detail.positions);
    setRevealed([]);
    setHitCell(null);
    setOpen(true);
  };

  const reveal = (cell: number) => {
    if (!open || positions === null || revealed.includes(cell)) return;
    if (positions.includes(cell)) {
      setHitCell(cell);
      setOpen(false);
      round.settle({
        returnMinor: 0,
        outcomeKey: "mine",
        outcomeLabel: `Mine getroffen nach ${revealed.length} ${revealed.length === 1 ? "Feld" : "Feldern"}`,
        detail: { mines: mineCount, revealed: revealed.length, hit: cell },
      });
      return;
    }
    const next = [...revealed, cell];
    setRevealed(next);
    if (next.length === safeCells) {
      setOpen(false);
      round.settle({
        returnMinor: minesReturnMinor(round.stake, mineCount, next.length),
        outcomeKey: "clear",
        outcomeLabel: `Alle ${safeCells} freien Felder aufgedeckt · ${minesMultiplier(mineCount, next.length).toLocaleString("de-DE")}×`,
        detail: { mines: mineCount, revealed: next.length },
      });
    }
  };

  const cashOut = () => {
    if (!open || revealed.length === 0) return;
    setOpen(false);
    round.settle({
      returnMinor: cashOutMinor,
      outcomeKey: "cashout",
      outcomeLabel: `Ausgezahlt nach ${revealed.length} ${revealed.length === 1 ? "Feld" : "Feldern"} · ${currentMultiplier.toLocaleString("de-DE")}×`,
      detail: { mines: mineCount, revealed: revealed.length },
    });
  };

  const ladder = minesLadder(mineCount);

  return (
    <GameShell
      game={game}
      status={round.status}
      hydrated={round.hydrated}
      last={round.last}
      available={round.available}
      stake={round.stake}
      onStakeChange={round.setStake}
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
      stakeLocked={open}
      actionHint={
        open
          ? "Auszahlen beendet die Runde und schreibt den aktuellen Multiplikator gut. Kein Echtgeld."
          : `Startet eine Demo-Runde und zieht ${formatCreditsWithUnit(round.stake)} Demo-Guthaben ab. Kein Echtgeld.`
      }
      controls={
        <fieldset disabled={open || round.busy} className="space-y-2">
          <legend className="text-sm font-medium text-primary">Anzahl Minen</legend>
          <div className="flex gap-2" role="group" aria-label="Anzahl Minen">
            {MINES_COUNTS.map((count) => {
              const active = count === mineCount;
              return (
                <Button
                  key={count}
                  variant="outline"
                  fullWidth
                  aria-pressed={active}
                  className={cn(active && "border-teal text-teal")}
                  onClick={() => setMineCount(count)}
                >
                  {count} {count === 1 ? "Mine" : "Minen"}
                  {active ? <span className="sr-only"> (gewählt)</span> : null}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Mehr Minen bedeuten größere Multiplikatoren und eine kleinere Chance, ein freies Feld zu treffen.
          </p>
        </fieldset>
      }
      primaryAction={
        open ? (
          <Button variant="primary" size="lg" fullWidth onClick={cashOut} disabled={revealed.length === 0}>
            {revealed.length === 0
              ? "Auszahlen — erst ab einem freien Feld"
              : `Auszahlen — Rückgabe ${formatCreditsWithUnit(cashOutMinor)}`}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={startRound}
            disabled={!round.canStart}
            iconLeft={<Play className="size-4" aria-hidden="true" />}
          >
            Runde starten
          </Button>
        )
      }
    >
      <div className="mx-auto max-w-md space-y-3">
        <h3 className="text-sm font-medium text-primary">
          Raster {MINES_GRID_SIZE} × {MINES_GRID_SIZE} · {mineCount} {mineCount === 1 ? "Mine" : "Minen"} · {safeCells} freie Felder
        </h3>

        <div className="grid grid-cols-5 gap-1 sm:gap-2" role="group" aria-label="Spielfeld">
          {Array.from({ length: MINES_CELLS }, (_, cell) => {
            const row = Math.floor(cell / MINES_GRID_SIZE) + 1;
            const column = (cell % MINES_GRID_SIZE) + 1;
            const isRevealed = revealed.includes(cell);
            const isHit = hitCell === cell;
            const isMine = positions?.includes(cell) ?? false;
            const showMine = isHit || (finished && isMine);
            const label = `Feld Zeile ${row}, Spalte ${column}${
              isRevealed ? " — frei" : showMine ? " — Mine" : open ? " — verdeckt" : ""
            }`;
            return (
              <button
                key={cell}
                type="button"
                onClick={() => reveal(cell)}
                disabled={!open || isRevealed}
                aria-label={label}
                className={cn(
                  "flex aspect-square min-h-11 min-w-11 items-center justify-center rounded-control border text-sm transition-state",
                  "disabled:cursor-not-allowed focus-visible:outline-none",
                  isRevealed && "border-success bg-elevated text-success",
                  showMine && "border-danger bg-elevated text-danger",
                  !isRevealed && !showMine && "border-border-control bg-base text-muted",
                  open && !isRevealed && "hover:border-gold-strong",
                )}
              >
                {isRevealed ? <Check className="size-4" aria-hidden="true" /> : null}
                {showMine ? <Bomb className="size-4" aria-hidden="true" /> : null}
                {!isRevealed && !showMine ? <span aria-hidden="true">·</span> : null}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-primary" aria-live="polite">
          {open
            ? revealed.length === 0
              ? "Runde läuft. Decke ein Feld auf."
              : `${revealed.length} von ${safeCells} freien Feldern aufgedeckt · aktuell ${currentMultiplier.toLocaleString("de-DE")}×`
            : positions === null
              ? "Bereit. Minenzahl und Einsatz wählen, dann Runde starten."
              : hitCell === null
                ? "Runde beendet."
                : "Mine getroffen — die Runde ist beendet."}
        </p>

        <details className="rounded-control border border-border-subtle bg-base p-3">
          <summary className="min-h-11 cursor-pointer list-none text-sm font-medium text-primary">
            Multiplikator-Staffel bei {mineCount} {mineCount === 1 ? "Mine" : "Minen"}
          </summary>
          <p className="mt-2 text-xs text-muted">
            Multiplikator nach k aufgedeckten Feldern = 0,97 geteilt durch die Wahrscheinlichkeit, k Felder in Folge
            frei zu treffen. Der Faktor 0,97 entspricht 3 % Hausvorteil.
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-4">
            {ladder.map((multiplier, index) => (
              <li
                key={index}
                className={cn(
                  "tabular rounded-[4px] border px-1 py-1 text-center text-xs",
                  revealed.length === index + 1 ? "border-teal text-teal" : "border-border-subtle text-muted",
                )}
              >
                {index + 1}: {multiplier.toLocaleString("de-DE")}×
              </li>
            ))}
          </ul>
        </details>

        <p className="text-xs text-muted">
          Für dieses Spiel wird kein RTP ausgewiesen: Der Erwartungswert einer Runde hängt davon ab, wann jemand
          aufhört. Fest steht nur der Hausvorteil je Stufe.
        </p>
      </div>
    </GameShell>
  );
}
