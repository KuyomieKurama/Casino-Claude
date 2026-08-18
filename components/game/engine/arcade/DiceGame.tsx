"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameEngineViewProps } from "@/types/engine";
import { ROUND_DURATION_MS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { DICE_BETS, DICE_MAX_ROLL, DICE_MIN_ROLL, type DiceDirection } from "@/data/paytables/arcade";
import { GameShell } from "../GameShell";
import { useRound } from "../useRound";
import { useRoundSettleSound } from "../sound/useRoundSettleSound";
import { parseDiceDetail } from "./dice-logic";

/**
 * Dice Demo — Oberfläche.
 *
 * Ein Wurf von 1 bis 100 je Runde. Richtung („unter“/„über“) und Zielwert wählt die spielende
 * Person vor der Runde; beides bestimmt die Auszahlungstabelle (Schlüssel g-dice-demo::<betId>).
 *
 * Bewusst NICHT vorhanden (Regel 7): kein Autoplay, keine Wiederhol-Automatik,
 * keine vorausgewählte „empfohlene“ Stufe. Voreingestellt ist die Stufe mit 50 % Trefferchance,
 * ohne dass sie als besser dargestellt würde. Farbe trägt nie allein: Trefferbereich und Wurf
 * stehen im Klartext.
 *
 * Klang: kein eigener Ton für Richtung/Stufe (Konfiguration vor der Runde, keine Spielaktion)
 * und keiner für einen knapp verfehlten Wurf (z. B. Ziel 50, Wurf 51) — nur "win" bei echtem
 * Netto-Gewinn bzw. "settle" sonst, über useRoundSettleSound. "chip" bei Einsatzänderung
 * übernimmt GameShell zentral.
 */

const CHANCE_STEPS = [50, 25, 20, 10, 5] as const;

export function DiceGame({ game, simulateLoadError = false, onStatusChange }: GameEngineViewProps) {
  const [direction, setDirection] = useState<DiceDirection>("over");
  const [chancePercent, setChancePercent] = useState<number>(50);

  const bet = useMemo(() => {
    const found = DICE_BETS.find((b) => b.direction === direction && Math.round(b.winChance * 100) === chancePercent);
    return found ?? DICE_BETS[0];
  }, [direction, chancePercent]);

  const round = useRound({
    game,
    server: true,
    roundDurationMs: ROUND_DURATION_MS,
    simulateLoadError,
    ...(onStatusChange ? { onStatusChange } : {}),
  });

  const { setBetId } = round;
  useEffect(() => {
    if (bet) setBetId(bet.id);
  }, [bet, setBetId]);

  useRoundSettleSound(round.last, round.inlineError);

  const detail = round.status === "finished" ? parseDiceDetail(round.last?.detail) : null;

  if (!bet) return null;

  const winFrom = bet.direction === "under" ? DICE_MIN_ROLL : bet.target + 1;
  const winTo = bet.direction === "under" ? bet.target - 1 : DICE_MAX_ROLL;
  // Anteil des Trefferbereichs an der Skala 1 … 100 — nur zur Größenordnung, nicht als
  // alleinige Information: darunter steht derselbe Bereich als Text.
  const winStartPercent = ((winFrom - 1) / DICE_MAX_ROLL) * 100;
  const winWidthPercent = ((winTo - winFrom + 1) / DICE_MAX_ROLL) * 100;

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
      startLabel="Würfeln"
      controls={
        <div className="space-y-3">
          <fieldset disabled={round.busy} className="space-y-2">
            <legend className="text-sm font-medium text-primary">Richtung</legend>
            <div className="flex gap-2" role="group" aria-label="Richtung">
              {(["under", "over"] as const).map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  fullWidth
                  aria-pressed={direction === d}
                  className={cn(direction === d && "border-teal text-teal")}
                  onClick={() => setDirection(d)}
                >
                  {d === "under" ? "Unter" : "Über"}
                  {direction === d ? <span className="sr-only"> (gewählt)</span> : null}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={round.busy} className="space-y-2">
            <legend className="text-sm font-medium text-primary">Stufe — Trefferchance</legend>
            <div className="grid grid-cols-5 gap-1" role="group" aria-label="Stufe">
              {CHANCE_STEPS.map((c) => (
                <Button
                  key={c}
                  variant="outline"
                  size="md"
                  className={cn("px-1", chancePercent === c && "border-teal text-teal")}
                  aria-pressed={chancePercent === c}
                  onClick={() => setChancePercent(c)}
                >
                  {c} %{chancePercent === c ? <span className="sr-only"> (gewählt)</span> : null}
                </Button>
              ))}
            </div>
          </fieldset>
        </div>
      }
    >
      <div className="mx-auto max-w-md space-y-3">
        <h3 className="text-sm font-medium text-primary">
          Ein Wurf von {DICE_MIN_ROLL} bis {DICE_MAX_ROLL}
        </h3>

        <div className="rounded-card border border-border-control bg-base p-3">
          <p className="text-sm text-primary">
            Gewählt: {bet.label} · Treffer bei {winFrom} bis {winTo} · Trefferchance{" "}
            {Math.round(bet.winChance * 100)} % · Auszahlung {bet.multiplier.toLocaleString("de-DE")}×
          </p>

          {/* Skala. Rein illustrativ (aria-hidden); die Zahlen stehen darüber und darunter. */}
          <div aria-hidden="true" className="relative mt-3 h-6 rounded-control border border-border-subtle bg-surface">
            <span
              className="absolute inset-y-0 rounded-[4px] bg-teal/25"
              style={{ left: `${winStartPercent}%`, width: `${winWidthPercent}%` }}
            />
            {detail ? (
              <span
                className="absolute inset-y-0 w-0.5 bg-primary"
                style={{ left: `calc(${((detail.roll - 0.5) / DICE_MAX_ROLL) * 100}% - 1px)` }}
              />
            ) : null}
          </div>
          <div aria-hidden="true" className="tabular mt-1 flex justify-between text-xs text-muted">
            <span>{DICE_MIN_ROLL}</span>
            <span>{DICE_MAX_ROLL}</span>
          </div>

          <p className="tabular mt-3 text-center text-xl font-semibold text-primary">
            {round.status === "playing" ? "…" : detail ? detail.roll : "—"}
          </p>
          <p className="text-center text-sm text-muted">
            {round.status === "playing"
              ? "Der Wurf läuft …"
              : detail
                ? `Wurf ${detail.roll} · ${detail.win ? "Treffer" : "kein Treffer"}`
                : "Noch kein Wurf in dieser Sitzung."}
          </p>
        </div>

        <p className="text-xs text-muted">
          Die Auszahlung ist 0,97 geteilt durch die Trefferchance. Jede Stufe hat damit denselben ausgewiesenen
          RTP von 97 %.
        </p>
      </div>
    </GameShell>
  );
}
