"use client";

import type { GameEngineViewProps } from "@/types/engine";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { WHEEL_SEGMENTS, WHEEL_SEGMENT_COUNT } from "@/data/paytables/arcade";
import { GameShell } from "../GameShell";
import { useRound } from "../useRound";
import { useRoundSettleSound } from "../sound/useRoundSettleSound";
import { useReelStopSound } from "../sound/useReelStopSound";
import { formatSegmentValue, parseWheelDetail, wheelHighlight, wheelSegmentAt } from "./wheel-logic";

/**
 * Wheel Demo — Oberfläche.
 *
 * Bewusst NICHT vorhanden (Regel 7):
 *  - kein Near Miss: Es gibt keinen Zeiger, der sich verlangsamt an hohen Segmenten vorbeischiebt.
 *    Während der Runde zeigt die Fläche einen neutralen Zustand, danach wird genau ein Segment
 *    markiert — wheelHighlight liefert ausschließlich den Index des getroffenen Segments.
 *    Die Segmentreihenfolge ist eine Konstante und wird zwischen Runden nie umsortiert.
 *  - kein Autoplay, keine Wiederhol-Automatik
 *  - Farbe trägt nie allein: jedes Segment ist benannt („Segment 7 · 0,5×“), das Ergebnis steht
 *    zusätzlich im Klartext.
 *
 * Klang: "stop" beim Anhalten des Rads (useReelStopSound), danach "win" bei echtem Netto-Gewinn
 * bzw. "settle" sonst (useRoundSettleSound) — beide genau einmal je Runde, kein Zwischenton
 * während der Drehung.
 */
export function WheelGame({ game, simulateLoadError = false, onStatusChange }: GameEngineViewProps) {
  const round = useRound({
    game,
    server: true,
    roundDurationMs: ROUND_DURATION_MS,
    simulateLoadError,
    ...(onStatusChange ? { onStatusChange } : {}),
  });

  useReelStopSound(round.last);
  useRoundSettleSound(round.last, round.inlineError);

  const detail = round.status === "finished" ? parseWheelDetail(round.last?.detail) : null;
  const highlighted = detail ? wheelHighlight(detail.index) : [];
  const hitSegment = detail ? wheelSegmentAt(detail.index) : null;

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
      startLabel="Rad drehen"
    >
      <div className="mx-auto max-w-md space-y-3">
        <h3 className="text-sm font-medium text-primary">Rad mit {WHEEL_SEGMENT_COUNT} gleich großen Segmenten</h3>

        <ul className="grid grid-cols-4 gap-1 sm:grid-cols-8" aria-label="Segmente des Rads">
          {WHEEL_SEGMENTS.map((segment) => {
            const hit = highlighted.includes(segment.index);
            return (
              <li
                key={segment.index}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center rounded-control border px-1 py-1 text-center transition-state",
                  hit ? "border-teal bg-elevated text-teal" : "border-border-subtle text-muted",
                )}
              >
                <span className="tabular text-xs">{segment.index + 1}</span>
                <span className={cn("tabular text-xs", hit && "font-semibold")}>{formatSegmentValue(segment.multiplier)}</span>
                {hit ? <span className="sr-only">getroffen</span> : null}
              </li>
            );
          })}
        </ul>

        <p className="text-sm text-primary">
          {round.status === "playing"
            ? "Das Rad dreht …"
            : hitSegment
              ? `Getroffen: ${hitSegment.name} · ${formatSegmentValue(hitSegment.multiplier)} Einsatz`
              : "Bereit. Einsatz wählen und das Rad drehen."}
        </p>

        <p className="text-xs text-muted">
          Jedes Segment trifft mit derselben Wahrscheinlichkeit von 1 zu {WHEEL_SEGMENT_COUNT}. Die Werte sind
          Multiplikatoren auf den Einsatz.
        </p>
      </div>
    </GameShell>
  );
}
