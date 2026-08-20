"use client";

import { useMemo } from "react";
import type { GameEngineViewProps } from "@/types/engine";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import {
  PLINKO_BUCKET_COUNT,
  PLINKO_ROWS,
  plinkoMultiplier,
} from "@/data/paytables/arcade";
import { GameShell } from "../GameShell";
import { useRound } from "../useRound";
import { useRoundSettleSound } from "../sound/useRoundSettleSound";
import { parsePlinkoDetail, plinkoHighlight, plinkoPositions, type PlinkoStep } from "./plinko-logic";

/**
 * Plinko Demo — Oberfläche.
 *
 * Bewusst NICHT vorhanden (Regel 7):
 *  - kein Near Miss: markiert wird ausschließlich das getroffene Fach (plinkoHighlight liefert
 *    genau einen Index). Während der Runde bleibt das Brett neutral — es gibt keine Animation,
 *    die die Kugel an einem hohen Außenfach „vorbeischrammen“ lässt, und keine Hervorhebung von
 *    Nachbarfächern nach der Runde.
 *  - kein Autoplay, keine Wiederhol-Automatik
 *  - kein Risikoregler (die Spielbeschreibung schließt ihn aus)
 *  - Farbe trägt nie allein: das getroffene Fach hat Rahmen, Fettung, Text und eine
 *    Ergebniszeile im Klartext.
 *
 * Klang: kein "stop" — die Kugel ist weder Walze, Rad noch Kessel (siehe Zuordnungsliste des
 * Auftrags). Nur "win" bei echtem Netto-Gewinn bzw. "settle" sonst (useRoundSettleSound), aus
 * demselben Grund keine Betonung eines hoch bewerteten Nachbarfachs.
 */
export function PlinkoGame({ game, simulateLoadError = false, onStatusChange }: GameEngineViewProps) {
  const round = useRound({
    game,
    server: true,
    roundDurationMs: ROUND_DURATION_MS,
    simulateLoadError,
    ...(onStatusChange ? { onStatusChange } : {}),
  });

  useRoundSettleSound(round.last, round.inlineError);

  const detail = round.status === "finished" ? parsePlinkoDetail(round.last?.detail) : null;
  const positions = useMemo(() => (detail ? plinkoPositions(detail.path) : null), [detail]);
  const highlighted = detail ? plinkoHighlight(detail.bucket) : [];

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
      startLabel="Kugel fallen lassen"
    >
      <div className="mx-auto max-w-md space-y-3">
        <h3 className="text-sm font-medium text-primary">
          Nagelbrett — {PLINKO_ROWS} Reihen, {PLINKO_BUCKET_COUNT} Fächer
        </h3>

        <div className="edge-light rounded-card border border-border-control bg-base p-2 sm:p-3">
          {/* Nagelreihen. Reihe r hat r+1 Nägel; die Kugel steht nach r Entscheidungen auf
              Position „Anzahl Rechts-Entscheidungen“. Rein dekorativ, daher aria-hidden —
              der Weg steht darunter im Klartext. */}
          <div aria-hidden="true" className="flex flex-col items-center gap-1.5">
            {Array.from({ length: PLINKO_ROWS }, (_, r) => (
              <div key={r} className="flex items-center justify-center gap-1.5">
                {Array.from({ length: r + 1 }, (_, i) => {
                  const onPath = positions !== null && positions[r] === i;
                  return (
                    <span
                      key={i}
                      className={cn(
                        "size-1.5 rounded-pill transition-state",
                        onPath ? "bg-accent-strong ring-2 ring-accent-strong/40" : "bg-border-control",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Fachwerte: bei 320 px passen 13 Spalten, weil kein Wert länger als drei Zeichen ist. */}
          <div
            className="mt-3 grid gap-px"
            style={{ gridTemplateColumns: `repeat(${PLINKO_BUCKET_COUNT}, minmax(0, 1fr))` }}
            role="list"
            aria-label="Fachwerte als Multiplikator"
          >
            {Array.from({ length: PLINKO_BUCKET_COUNT }, (_, k) => {
              const hit = highlighted.includes(k);
              const value = plinkoMultiplier(k);
              return (
                <span
                  key={k}
                  role="listitem"
                  className={cn(
                    "tabular flex min-h-8 items-center justify-center overflow-hidden rounded-xs border px-0 text-[0.625rem] leading-none sm:text-xs",
                    hit ? "border-accent bg-elevated font-semibold text-accent" : "border-border-subtle text-muted",
                  )}
                >
                  <span className="sr-only">
                    Fach {k + 1}: {value.toLocaleString("de-DE")}-facher Einsatz{hit ? " — getroffen" : ""}
                  </span>
                  <span aria-hidden="true">{value.toLocaleString("de-DE")}</span>
                </span>
              );
            })}
          </div>
          <p className="mt-1 text-center text-xs text-muted">Werte sind Multiplikatoren auf den Einsatz.</p>
        </div>

        {round.status === "playing" ? (
          <p className="text-center text-sm text-muted anim-fade-in">Die Kugel fällt …</p>
        ) : detail ? (
          <div className="space-y-1 anim-fade-in">
            <p className="text-sm text-primary">
              Getroffen: Fach {detail.bucket + 1} von {PLINKO_BUCKET_COUNT} ·{" "}
              {plinkoMultiplier(detail.bucket).toLocaleString("de-DE")}× Einsatz
            </p>
            <p className="text-xs text-muted">Weg der Kugel: {describePath(detail.path)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Die Kugel entscheidet sich in jeder Reihe für links oder rechts. Der Weg wird aus dem Rundenseed abgeleitet
            und nach der Runde vollständig angezeigt.
          </p>
        )}
      </div>
    </GameShell>
  );
}

function describePath(path: readonly PlinkoStep[]): string {
  return path.map((s) => (s === "L" ? "links" : "rechts")).join(" · ");
}
