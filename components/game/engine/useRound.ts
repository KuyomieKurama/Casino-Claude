"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "@/types/game";
import type { RoundStatus } from "@/types/game-round";
import type { EngineOutcome } from "@/types/engine";
import { useWallet } from "@/state/WalletContext";
import { useRgStatus } from "@/state/RgContext";
import { availableMinor, type WalletRejection } from "@/state/wallet-reducer";
import { createSeed } from "@/lib/rng";
import { createId } from "@/lib/ids";
import { GAME_LOAD_MS } from "@/lib/constants";

export type LastRoundResult = {
  roundId: string;
  outcomeKey: string;
  outcomeLabel: string;
  stakeMinor: number;
  returnMinor: number;
  /** Angezeigte Zahl: Rückgabe − Einsatz (Vorentscheidung E5). */
  netMinor: number;
  seed: number;
  usedFreeSpin: boolean;
  detail?: Record<string, unknown>;
};

export type UseRoundOptions = {
  game: Game;
  /** Löst die Runde auf — reine Funktion aus Seed und Einsatz. */
  resolve: (input: { stakeMinor: number; seed: number; betId?: string }) => EngineOutcome;
  /** Dauer der Rundenanimation in ms. */
  roundDurationMs: number;
  /** true, wenn das Ergebnis erst durch Spielerentscheidungen feststeht (Blackjack, Mines). */
  interactive?: boolean;
  simulateLoadError?: boolean;
  onStatusChange?: (status: RoundStatus) => void;
  /** Voreingestellter Einsatz; wird auf den Demo-Bereich des Spiels begrenzt. */
  defaultStakeMinor?: number;
};

/**
 * Gemeinsame Rundenchoreografie für alle Engines: Laden → Bereit → Einsatz → Runde → Ergebnis.
 * Kapselt Wallet-Buchung, Doppelklick-Schutz, RG-Sperre, Inline-Fehler und alle sieben
 * RoundStatus-Werte. Die Engines liefern nur Spiellogik und Darstellung.
 *
 * Bewusst NICHT enthalten (Regel 7): kein Autoplay, kein Turbospin, keine Wiederholautomatik.
 */
export function useRound({ game, resolve, roundDurationMs, interactive = false, simulateLoadError = false, onStatusChange, defaultStakeMinor }: UseRoundOptions) {
  const { hydrated, wallet, startRound, settleRound, raiseRoundStake, lastRejection, clearRejection } = useWallet();
  const rg = useRgStatus(5000);

  const [status, setStatusRaw] = useState<RoundStatus>("idle");
  const [stake, setStakeRaw] = useState<number>(() => clampStake(defaultStakeMinor ?? 100, game));
  const [betId, setBetId] = useState<string | undefined>(undefined);
  const [useFreeSpin, setUseFreeSpin] = useState(false); // nie vorausgewählt (Regel 7)
  const [last, setLast] = useState<LastRoundResult | null>(null);
  const [inlineError, setInlineError] = useState<WalletRejection | null>(null);
  const [failNextLoad, setFailNextLoad] = useState(simulateLoadError);
  const [pausedFrom, setPausedFrom] = useState<RoundStatus>("ready");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Läuft eine interaktive Runde, liegt hier alles, was zum Abschluss gebraucht wird. */
  const openRound = useRef<null | { roundId: string; stakeMinor: number; seed: number; usedFreeSpin: boolean; outcome: EngineOutcome }>(null);

  const setStatus = useCallback(
    (s: RoundStatus) => {
      setStatusRaw(s);
      onStatusChange?.(s);
    },
    [onStatusChange],
  );

  const addTimer = (t: ReturnType<typeof setTimeout>) => {
    timers.current.push(t);
    return t;
  };

  const load = useCallback(() => {
    setStatus("loading");
    addTimer(
      setTimeout(() => {
        if (failNextLoad) {
          setFailNextLoad(false);
          setStatus("error");
        } else {
          setStatus("ready");
        }
      }, GAME_LOAD_MS),
    );
  }, [failNextLoad, setStatus]);

  useEffect(() => {
    load();
    const list = timers.current;
    return () => {
      list.forEach(clearTimeout);
      list.length = 0;
    };
    // Nur einmal beim Mount laden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastRejection && ["INSUFFICIENT_FUNDS", "INVALID_STAKE", "NO_FREE_SPINS", "RETURN_OUT_OF_RANGE"].includes(lastRejection.code)) {
      setInlineError(lastRejection);
    }
  }, [lastRejection]);

  const available = availableMinor(wallet);
  const insufficient = hydrated && !useFreeSpin && available < stake;
  const busy = status === "playing" || status === "loading";
  const blocked = rg.hydrated && rg.blocked;
  const canStart = hydrated && !busy && status !== "idle" && status !== "error" && status !== "paused" && !blocked && !wallet.roundInFlight && !insufficient;

  const setStake = useCallback(
    (value: number) => {
      setStakeRaw(clampStake(value, game));
      setInlineError(null);
    },
    [game],
  );

  /** Startet eine Runde. Bei interaktiven Engines liefert der Rückgabewert die Runden-ID zum späteren Abschluss. */
  const start = useCallback((): { roundId: string; outcome: EngineOutcome } | null => {
    // `canStart` stammt aus dem letzten Render und ist bei mehreren Klicks im selben Task noch
    // veraltet. Die offene Runde im Ref ist dagegen sofort aktuell.
    if (!canStart || openRound.current !== null) return null;
    setInlineError(null);
    clearRejection();
    const seed = createSeed();
    const roundId = createId("r");
    const outcome = resolve({ stakeMinor: useFreeSpin ? stake : stake, seed, betId });
    const rejection = startRound({
      roundId,
      gameId: game.id,
      stakeMinor: stake,
      minStakeMinor: game.minDemoBetMinor,
      maxStakeMinor: game.maxDemoBetMinor,
      returnMinor: outcome.returnMinor,
      outcomeKey: outcome.outcomeKey,
      seed,
      useFreeSpin,
      ...(interactive ? { interactive: true, maxReturnMinor: outcome.maxReturnMinor ?? outcome.returnMinor } : {}),
    });
    if (rejection) {
      setInlineError(rejection);
      return null;
    }
    openRound.current = { roundId, stakeMinor: useFreeSpin ? 0 : stake, seed, usedFreeSpin: useFreeSpin, outcome };
    setLast(null);
    setStatus("playing");
    return { roundId, outcome };
  }, [canStart, clearRejection, resolve, stake, betId, startRound, game, useFreeSpin, interactive, setStatus]);

  /**
   * Schließt die laufende Runde ab. `finalOutcome` nur bei interaktiven Engines — der Reducer
   * akzeptiert höchstens die beim Start deklarierte Obergrenze.
   */
  const settle = useCallback(
    (finalOutcome?: Partial<Pick<EngineOutcome, "returnMinor" | "outcomeKey" | "outcomeLabel" | "detail">>) => {
      const open = openRound.current;
      if (!open) return;
      const returnMinor = finalOutcome?.returnMinor ?? open.outcome.returnMinor;
      const rejection = settleRound(open.roundId, interactive ? returnMinor : undefined);
      if (rejection) {
        setInlineError(rejection);
        return;
      }
      setLast({
        roundId: open.roundId,
        outcomeKey: finalOutcome?.outcomeKey ?? open.outcome.outcomeKey,
        outcomeLabel: finalOutcome?.outcomeLabel ?? open.outcome.outcomeLabel,
        stakeMinor: open.stakeMinor,
        returnMinor,
        netMinor: returnMinor - open.stakeMinor,
        seed: open.seed,
        usedFreeSpin: open.usedFreeSpin,
        detail: finalOutcome?.detail ?? open.outcome.detail,
      });
      if (open.usedFreeSpin && wallet.freeSpins - 1 <= 0) setUseFreeSpin(false);
      openRound.current = null;
      setStatus("finished");
    },
    [settleRound, interactive, wallet.freeSpins, setStatus],
  );

  /**
   * Zusatzeinsatz in einer laufenden interaktiven Runde (Blackjack: Verdoppeln, Teilen).
   * Wird als eigene Transaktion gebucht, damit die Historie den tatsächlich gesetzten Betrag zeigt.
   * Rückgabe: true, wenn angenommen.
   */
  const raiseStake = useCallback(
    (additionalMinor: number): boolean => {
      const open = openRound.current;
      if (!open) return false;
      const rejection = raiseRoundStake(open.roundId, additionalMinor);
      if (rejection) {
        setInlineError(rejection);
        return false;
      }
      open.stakeMinor += additionalMinor;
      return true;
    },
    [raiseRoundStake],
  );

  /** Nicht-interaktive Engines: Start und Abschluss nach der Animationsdauer in einem Schritt. */
  const play = useCallback(() => {
    const started = start();
    if (!started) return null;
    addTimer(setTimeout(() => settle(), roundDurationMs));
    return started;
  }, [start, settle, roundDurationMs]);

  const togglePause = useCallback(() => {
    setStatusRaw((current) => {
      if (current === "paused") {
        onStatusChange?.(pausedFrom);
        return pausedFrom;
      }
      if (current === "ready" || current === "finished") {
        setPausedFrom(current);
        onStatusChange?.("paused");
        return "paused";
      }
      return current;
    });
  }, [pausedFrom, onStatusChange]);

  const stakeBounds = useMemo(() => ({ min: game.minDemoBetMinor, max: game.maxDemoBetMinor }), [game]);

  return {
    // Zustand
    status,
    setStatus,
    hydrated,
    wallet,
    available,
    stake,
    setStake,
    stakeBounds,
    betId,
    setBetId,
    useFreeSpin,
    setUseFreeSpin,
    last,
    inlineError,
    insufficient,
    busy,
    blocked,
    blockReason: rg.reason,
    canStart,
    // Aktionen
    load,
    start,
    settle,
    raiseStake,
    play,
    togglePause,
    /** Nur für interaktive Engines: liegt eine offene Runde vor? */
    hasOpenRound: () => openRound.current !== null,
    openRoundSeed: () => openRound.current?.seed,
  };
}

function clampStake(value: number, game: Game): number {
  const v = Math.round(value);
  return Math.min(Math.max(v, game.minDemoBetMinor), game.maxDemoBetMinor);
}
