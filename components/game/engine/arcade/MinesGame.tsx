"use client";

import { useEffect, useState } from "react";
import { Bomb, Check, Play } from "lucide-react";
import type { GameEngineViewProps } from "@/types/engine";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { formatCreditsWithUnit } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { GameShell } from "../GameShell";
import { useRound } from "../useRound";
import { useSound } from "../sound/useEngineSound";
import { useRoundSettleSound } from "../sound/useRoundSettleSound";
import { MINES_CELLS, MINES_COUNTS, MINES_DEFAULT_COUNT, MINES_GRID_SIZE, minesBetId, minesLadder, minesReturnMinor, type MinesCount } from "./mines-logic";

/**
 * Mines Demo — Oberfläche, interaktiv, seit Phase 3b vollständig serverseitig aufgelöst.
 *
 * Die größte Schwachstelle aus Phase 3a war, dass `startMinesRound` (mines-logic.ts) die
 * Minenpositionen sofort an den Client lieferte — wer wollte, konnte sie im Speicher auslesen,
 * bevor überhaupt ein Feld aufgedeckt war. Seit dieser Phase kommt der Zustand ausschließlich aus
 * `round.interactiveState` (useRound.ts → POST /api/rounds/interactive-start und
 * POST /api/rounds/:id/actions): der Server liefert je Zug NUR das Ergebnis des gerade
 * aufgedeckten Feldes und den aktuellen Multiplikator, niemals die übrigen Positionen — sichtbar
 * an `MinesServerState` unten, das `positions`/`hitCell` erst nach Rundenende überhaupt kennt.
 *
 * Bewusst NICHT vorhanden (Regel 7): kein Autoplay, keine Wiederhol-Automatik,
 * keine Strategiehinweise („jetzt aufhören“), keine Feier bei Rückgabe unter Einsatz.
 * Farbe trägt nie allein: jedes Feld hat Symbol und Text.
 *
 * Klang: "click" beim Aufdecken eines Feldes und beim Auszahlen — beide sind die einzigen
 * Spieleraktionen dieser Engine. "win" ausschließlich bei echtem Netto-Gewinn (netMinor > 0,
 * dieselbe Größe wie die Nettoanzeige der Shell), sonst "settle" — auch beim Verlust der
 * gesamten Runde (Mine getroffen, Rückgabe 0). Kein eigener Ton für ein sicheres Feld direkt
 * neben einer Mine: Es gibt keinen Unterschied zwischen einem knapp verfehlten und einem
 * beliebigen anderen sicheren Feld, beide lösen nur "click" aus (kein Near Miss, Regel 7).
 */

type MinesRoundStatus = "open" | "hit" | "cashedOut" | "cleared";

/** Spiegelt server/rounds/interactive/mines-adapter.ts::MinesPublicView(Open|Finished) — der
 *  Client kennt den Servertyp nicht (Schichtregel), deshalb eine eigene, rein lokale Prüfung. */
type MinesServerState = {
  mines: MinesCount;
  status: MinesRoundStatus;
  revealedCells: number[];
  revealedCount: number;
  multiplier: number;
  cellsRemaining: number;
  /** Nur vorhanden, wenn die Runde beendet ist — vom Server bewusst vorher weggelassen. */
  positions?: number[];
  hitCell?: number | null;
};

function isMinesCountValue(value: unknown): value is MinesCount {
  return typeof value === "number" && (MINES_COUNTS as readonly number[]).includes(value);
}

function parseMinesServerState(value: unknown): MinesServerState | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isMinesCountValue(v.mines)) return null;
  if (typeof v.status !== "string" || !["open", "hit", "cashedOut", "cleared"].includes(v.status)) return null;
  if (!Array.isArray(v.revealedCells) || v.revealedCells.some((c) => typeof c !== "number")) return null;
  if (typeof v.revealedCount !== "number" || typeof v.multiplier !== "number" || typeof v.cellsRemaining !== "number") return null;
  const positions = Array.isArray(v.positions) && v.positions.every((p) => typeof p === "number") ? (v.positions as number[]) : undefined;
  const hitCell = typeof v.hitCell === "number" ? v.hitCell : null;
  return {
    mines: v.mines,
    status: v.status as MinesRoundStatus,
    revealedCells: v.revealedCells as number[],
    revealedCount: v.revealedCount,
    multiplier: v.multiplier,
    cellsRemaining: v.cellsRemaining,
    ...(positions ? { positions } : {}),
    hitCell,
  };
}

export function MinesGame({ game, simulateLoadError = false, onStatusChange }: GameEngineViewProps) {
  const [mineCount, setMineCount] = useState<MinesCount>(MINES_DEFAULT_COUNT);

  const round = useRound({
    game,
    roundDurationMs: ROUND_DURATION_MS,
    interactive: true,
    server: true,
    simulateLoadError,
    ...(onStatusChange ? { onStatusChange } : {}),
  });

  const { setBetId } = round;
  useEffect(() => {
    setBetId(minesBetId(mineCount));
  }, [mineCount, setBetId]);

  const { play } = useSound();
  useRoundSettleSound(round.last, round.inlineError);

  const state = parseMinesServerState(round.interactiveState);
  const open = round.status === "playing";
  const finished = round.status === "finished";
  const revealed = state?.revealedCells ?? [];
  const currentMultiplier = state?.multiplier ?? 0;
  const cashOutMinor = state ? minesReturnMinor(round.stake, state.mines, state.revealedCount) : 0;
  const positions = finished ? (state?.positions ?? []) : [];
  const hitCell = finished ? (state?.hitCell ?? null) : null;

  const startRound = () => {
    void round.startInteractive();
  };

  const reveal = (cell: number) => {
    if (!open || !state || state.status !== "open" || revealed.includes(cell)) return;
    play("click");
    void round.sendAction("reveal", { cell });
  };

  const cashOut = () => {
    if (!open || revealed.length === 0) return;
    play("click");
    void round.sendAction("cashOut", {});
  };

  const ladder = minesLadder(mineCount);
  const displayMineCount = state?.mines ?? mineCount;
  const displaySafeCells = MINES_CELLS - displayMineCount;

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
          : `Startet eine Runde und zieht ${formatCreditsWithUnit(round.stake)} Guthaben ab. Kein Echtgeld.`
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
                  className={cn(active && "border-accent text-accent")}
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
          Raster {MINES_GRID_SIZE} × {MINES_GRID_SIZE} · {displayMineCount} {displayMineCount === 1 ? "Mine" : "Minen"} · {displaySafeCells} freie Felder
        </h3>

        <div className="grid grid-cols-5 gap-1 sm:gap-2" role="group" aria-label="Spielfeld">
          {Array.from({ length: MINES_CELLS }, (_, cell) => {
            const row = Math.floor(cell / MINES_GRID_SIZE) + 1;
            const column = (cell % MINES_GRID_SIZE) + 1;
            const isRevealed = revealed.includes(cell);
            const isHit = hitCell === cell;
            const isMine = positions.includes(cell);
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
                  "edge-light flex aspect-square min-h-11 min-w-11 items-center justify-center rounded-control border text-sm transition-state",
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
              : `${revealed.length} von ${displaySafeCells} freien Feldern aufgedeckt · aktuell ${currentMultiplier.toLocaleString("de-DE")}×`
            : !round.last
              ? "Bereit. Minenzahl und Einsatz wählen, dann Runde starten."
              : hitCell === null
                ? "Runde beendet."
                : "Mine getroffen — die Runde ist beendet."}
        </p>

        <details className="edge-light rounded-control border border-border-subtle bg-base p-3">
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
                  "tabular rounded-xs border px-1 py-1 text-center text-xs",
                  revealed.length === index + 1 ? "border-accent text-accent" : "border-border-subtle text-muted",
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
