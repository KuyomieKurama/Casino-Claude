"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "@/types/game";
import type { RoundStatus } from "@/types/game-round";
import type { EngineOutcome } from "@/types/engine";
import { useWallet } from "@/state/WalletContext";
import { useRgStatus } from "@/state/RgContext";
import { availableMinor, rejectionMessage, type WalletRejection } from "@/state/wallet-reducer";
import { createSeed } from "@/lib/rng";
import { createId, nowIso } from "@/lib/ids";
import { GAME_LOAD_MS } from "@/lib/constants";
import { postRoundStart } from "./round-api-client";
import { postInteractiveRoundStart, postRoundAction, type RoundApiWalletSnapshot } from "./interactive-round-api-client";

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
  /**
   * Löst die Runde auf — reine Funktion aus Seed und Einsatz. Nur für den ÄLTEREN, LOKALEN
   * interaktiven Pfad (`interactive: true` OHNE `server: true`) — inzwischen ungenutzt, da
   * Blackjack, Mines und Video Poker seit Phase 3b serverseitig laufen (`interactive: true` UND
   * `server: true`, siehe `startInteractive()`/`sendAction()` unten). Bleibt vorerst erhalten,
   * falls ein künftiges, rein lokales Demo-Szenario ohne Datenbank sie wieder braucht.
   */
  resolve?: (input: { stakeMinor: number; seed: number; betId?: string }) => EngineOutcome;
  /** Dauer der Rundenanimation in ms. */
  roundDurationMs: number;
  /** true, wenn das Ergebnis erst durch Spielerentscheidungen feststeht (Blackjack, Mines, Video Poker). */
  interactive?: boolean;
  /**
   * Phase 3a (nicht-interaktiv) / Phase 3b (interaktiv): die Runde wird serverseitig aufgelöst
   * und gebucht. Seed entsteht ausschließlich serverseitig; der Client sendet nur Modus, Einsatz,
   * Wettauswahl und — bei interaktiven Runden — Spieleraktionen, niemals ein Ergebnis.
   *  - `server: true, interactive: false` (Slots, Roulette, Baccarat, Dice, Plinko, Wheel):
   *    `play()` → POST /api/rounds/start, Ergebnis liegt sofort fest.
   *  - `server: true, interactive: true` (Blackjack, Mines, Video Poker): `startInteractive()` →
   *    POST /api/rounds/interactive-start (Runde bleibt meist offen), `sendAction()` → POST
   *    /api/rounds/:id/actions für jeden Spielzug, bis der Server die Runde abschließt.
   */
  server?: boolean;
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
export function useRound({
  game,
  resolve,
  roundDurationMs,
  interactive = false,
  server = false,
  simulateLoadError = false,
  onStatusChange,
  defaultStakeMinor,
}: UseRoundOptions) {
  const { hydrated, wallet, startRound, settleRound, raiseRoundStake, lastRejection, clearRejection, syncServerWallet } = useWallet();
  const rg = useRgStatus(5000);

  const [status, setStatusRaw] = useState<RoundStatus>("idle");
  const [stake, setStakeRaw] = useState<number>(() => clampStake(defaultStakeMinor ?? 100, game));
  const [betId, setBetId] = useState<string | undefined>(undefined);
  /** Strukturierte Wettauswahl für Familien, denen ein einfacher betId nicht reicht (Roulette). */
  const [betPayload, setBetPayload] = useState<unknown>(undefined);
  const [useFreeSpin, setUseFreeSpin] = useState(false); // nie vorausgewählt (Regel 7)
  const [last, setLast] = useState<LastRoundResult | null>(null);
  const [inlineError, setInlineError] = useState<WalletRejection | null>(null);
  const [failNextLoad, setFailNextLoad] = useState(simulateLoadError);
  const [pausedFrom, setPausedFrom] = useState<RoundStatus>("ready");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Läuft eine interaktive Runde, liegt hier alles, was zum Abschluss gebraucht wird. */
  const openRound = useRef<null | { roundId: string; stakeMinor: number; seed: number; usedFreeSpin: boolean; outcome: EngineOutcome }>(null);
  /**
   * Doppelklick-Schutz für serverseitige Runden (Phase 3a): `canStart` stammt aus dem letzten
   * Render und ist bei mehreren Klicks im selben Task noch veraltet — derselbe Grund, aus dem
   * `start()` unten `openRound.current` statt `canStart` prüft. Serverrunden haben kein
   * lokales `openRound`-Äquivalent (das Ergebnis kommt erst asynchron zurück), deshalb ein
   * eigener, sofort aktueller Sperrschalter.
   */
  const serverRoundPending = useRef(false);
  /**
   * Phase 3b (interaktive Server-Runden): läuft eine offene Runde, liegt hier die Runden-ID und
   * die vom Client vorzugebende nächste Aktionsposition (`seq`, siehe round-action-service.ts,
   * „UNIQUE (round_id, seq) sichert Idempotenz"). `null`, solange keine Runde offen ist ODER die
   * Runde bereits abgeschlossen wurde — danach sind keine weiteren Aktionen mehr zulässig.
   */
  const interactiveRound = useRef<{ roundId: string; nextSeq: number } | null>(null);
  /**
   * Ob die laufende interaktive Runde eine Freirunde ist — die Aktionsantwort selbst trägt das
   * nicht (server/rounds/round-action-service.ts::ApplyActionSettledData), nur die Startantwort.
   * Wird bei `startInteractive()` gesetzt und bei Abschluss ausgewertet (Freirunden-Zähler).
   */
  const interactiveWasFreeSpin = useRef(false);
  /** Eigener Sperrschalter wie `serverRoundPending` — derselbe Grund (siehe dortiger Kommentar). */
  const interactiveActionPending = useRef(false);
  /**
   * Sichtbarer Zustand der laufenden interaktiven Server-Runde — GENAU das, was der Server in
   * `state` liefert (z. B. bei Mines: aufgedeckte Felder und aktueller Multiplikator, NIE die
   * übrigen Minenpositionen vor Rundenende). Nur die jeweilige Spieloberfläche kennt die Form.
   */
  const [interactiveState, setInteractiveState] = useState<unknown>(null);

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
    if (!resolve) {
      // Programmierfehler, kein Nutzerzustand: `resolve` ist bei server: true optional, `start()`
      // ist dann aber nicht der richtige Aufrufpfad — nicht-interaktive Server-Runden laufen über
      // `play()` → `playServer()`. Kein stiller Fallback bei einer Geldbewegung.
      throw new Error("useRound: resolve() fehlt. Bei server: true muss play() statt start() verwendet werden.");
    }
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

  /**
   * Nicht-interaktive Server-Runde (Phase 3a): POST /api/rounds/start löst Einsatzbuchung,
   * Ergebnis und Rückgabe serverseitig auf — der Client sendet nur Modus, Einsatz und
   * Wettauswahl, nie ein Ergebnis oder einen Seed. Die Animationsdauer bleibt sichtbar: das
   * Ergebnis liegt zwar sofort nach der Antwort fest, wird aber erst nach `roundDurationMs`
   * angezeigt (dieselbe Choreografie wie bei lokal aufgelösten Runden).
   */
  const playServer = useCallback(async () => {
    if (!canStart || serverRoundPending.current) return;
    serverRoundPending.current = true;
    setInlineError(null);
    clearRejection();
    setLast(null);
    setStatus("playing");
    try {
      const result = await postRoundStart({
        gameModeId: game.id,
        stakeMinor: stake,
        idempotencyKey: createId("idem"),
        useFreeSpin,
        ...(betId === undefined ? {} : { betId }),
        ...(betPayload === undefined ? {} : { bet: betPayload }),
      });
      if (!result.ok) {
        setStatus("ready");
        setInlineError({ code: result.code, message: rejectionMessage(result.code), at: nowIso() });
        return;
      }
      syncServerWallet(result.data.wallet);
      addTimer(
        setTimeout(() => {
          setLast({
            roundId: result.data.roundId,
            outcomeKey: result.data.outcomeKey,
            outcomeLabel: result.data.outcomeLabel,
            stakeMinor: result.data.stakeMinor,
            returnMinor: result.data.returnMinor,
            netMinor: result.data.netMinor,
            seed: result.data.seed,
            usedFreeSpin: result.data.usedFreeSpin,
            ...(result.data.detail ? { detail: result.data.detail } : {}),
          });
          if (result.data.usedFreeSpin && result.data.wallet.freeSpins <= 0) setUseFreeSpin(false);
          setStatus("finished");
        }, roundDurationMs),
      );
    } finally {
      serverRoundPending.current = false;
    }
  }, [canStart, clearRejection, game.id, stake, useFreeSpin, betId, betPayload, roundDurationMs, syncServerWallet, setStatus]);

  /**
   * Gemeinsamer Abschluss für `startInteractive()`/`sendAction()`, sobald die Server-Antwort
   * `status: "settled"` meldet — dieselbe Animationsdauer-Choreografie wie `playServer()`: das
   * Ergebnis steht sofort fest, wird aber erst nach `roundDurationMs` angezeigt.
   */
  const finishInteractive = useCallback(
    (data: {
      roundId: string;
      returnMinor: number;
      netMinor: number;
      outcomeKey: string;
      outcomeLabel: string;
      seed: number;
      usedFreeSpin: boolean;
      stakeMinor: number;
      wallet: RoundApiWalletSnapshot;
      detail?: Record<string, unknown>;
    }) => {
      interactiveRound.current = null;
      syncServerWallet(data.wallet);
      addTimer(
        setTimeout(() => {
          setLast({
            roundId: data.roundId,
            outcomeKey: data.outcomeKey,
            outcomeLabel: data.outcomeLabel,
            stakeMinor: data.stakeMinor,
            returnMinor: data.returnMinor,
            netMinor: data.netMinor,
            seed: data.seed,
            usedFreeSpin: data.usedFreeSpin,
            ...(data.detail ? { detail: data.detail } : {}),
          });
          if (data.usedFreeSpin && data.wallet.freeSpins <= 0) setUseFreeSpin(false);
          setStatus("finished");
        }, roundDurationMs),
      );
    },
    [roundDurationMs, syncServerWallet, setStatus],
  );

  /**
   * Startet eine interaktive Server-Runde (Blackjack, Mines, Video Poker; Phase 3b). Anders als
   * `playServer()` ist die Runde danach meist noch OFFEN — `interactiveState` zeigt exakt das, was
   * der Server zu diesem Zeitpunkt preisgibt (nie mehr, siehe interactive-round-api-client.ts).
   * Einzige Ausnahme: ein natürlicher Blackjack beim Austeilen ist sofort `settled`.
   * Rückgabe: der sichtbare Zustand (für die Engine, die z. B. direkt danach die ausgeteilten
   * Karten zeigen will), oder `null` bei Ablehnung/Doppelklick.
   */
  const startInteractive = useCallback(async (): Promise<unknown | null> => {
    if (!canStart || interactiveActionPending.current) return null;
    interactiveActionPending.current = true;
    setInlineError(null);
    clearRejection();
    setLast(null);
    setInteractiveState(null);
    setStatus("playing");
    try {
      const result = await postInteractiveRoundStart({
        gameModeId: game.id,
        stakeMinor: stake,
        idempotencyKey: createId("idem"),
        useFreeSpin,
        ...(betId === undefined ? {} : { betId }),
      });
      if (!result.ok) {
        setStatus("ready");
        setInlineError({ code: result.code, message: rejectionMessage(result.code), at: nowIso() });
        return null;
      }
      setInteractiveState(result.data.state);
      if (result.data.status === "settled") {
        finishInteractive({
          roundId: result.data.roundId,
          returnMinor: result.data.returnMinor,
          netMinor: result.data.netMinor,
          outcomeKey: result.data.outcomeKey,
          outcomeLabel: result.data.outcomeLabel,
          seed: result.data.seed,
          usedFreeSpin: result.data.usedFreeSpin,
          stakeMinor: result.data.stakeMinor,
          wallet: result.data.wallet,
          ...(result.data.detail ? { detail: result.data.detail } : {}),
        });
        return result.data.state;
      }
      syncServerWallet(result.data.wallet);
      interactiveWasFreeSpin.current = result.data.usedFreeSpin;
      interactiveRound.current = { roundId: result.data.roundId, nextSeq: result.data.nextSeq };
      return result.data.state;
    } finally {
      interactiveActionPending.current = false;
    }
  }, [canStart, clearRejection, game.id, stake, useFreeSpin, betId, syncServerWallet, finishInteractive, setStatus]);

  /**
   * Sendet eine Spieleraktion der laufenden interaktiven Server-Runde (hit, stand, double, split,
   * reveal, cashOut, draw — je nach Engine). `payload` ist engine-spezifisch (z. B. `{ cell }` bei
   * Mines) und wird ungeprüft an den Server weitergereicht — die Prüfung übernimmt ausschließlich
   * der Server (server/rounds/interactive/*-adapter.ts), niemals der Client.
   * Rückgabe: der neue sichtbare Zustand, oder `null` bei Ablehnung/ohne offene Runde.
   */
  const sendAction = useCallback(
    async (action: string, payload?: unknown): Promise<unknown | null> => {
      const open = interactiveRound.current;
      if (!open || interactiveActionPending.current) return null;
      interactiveActionPending.current = true;
      setInlineError(null);
      try {
        const result = await postRoundAction(open.roundId, { seq: open.nextSeq, action, payload });
        if (!result.ok) {
          setInlineError({ code: result.code, message: rejectionMessage(result.code), at: nowIso() });
          return null;
        }
        setInteractiveState(result.data.state);
        syncServerWallet(result.data.wallet);
        if (result.data.status === "settled") {
          finishInteractive({
            roundId: result.data.roundId,
            returnMinor: result.data.returnMinor,
            netMinor: result.data.netMinor,
            outcomeKey: result.data.outcomeKey,
            outcomeLabel: result.data.outcomeLabel,
            seed: result.data.seed,
            usedFreeSpin: interactiveWasFreeSpin.current,
            stakeMinor: result.data.stakeMinor,
            wallet: result.data.wallet,
            ...(result.data.detail ? { detail: result.data.detail } : {}),
          });
          return result.data.state;
        }
        interactiveRound.current = { roundId: result.data.roundId, nextSeq: result.data.nextSeq };
        return result.data.state;
      } finally {
        interactiveActionPending.current = false;
      }
    },
    [syncServerWallet, finishInteractive],
  );

  /** Nicht-interaktive Engines: Start und Abschluss nach der Animationsdauer in einem Schritt. */
  const play = useCallback(() => {
    if (server) {
      void playServer();
      return null;
    }
    const started = start();
    if (!started) return null;
    addTimer(setTimeout(() => settle(), roundDurationMs));
    return started;
  }, [server, playServer, start, settle, roundDurationMs]);

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
    betPayload,
    setBetPayload,
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
    // Interaktive Server-Runden (Phase 3b: Blackjack, Mines, Video Poker) — nur relevant bei
    // `server: true, interactive: true`, siehe UseRoundOptions.server oben.
    interactiveState,
    startInteractive,
    sendAction,
    hasOpenInteractiveRound: () => interactiveRound.current !== null,
  };
}

function clampStake(value: number, game: Game): number {
  const v = Math.round(value);
  return Math.min(Math.max(v, game.minDemoBetMinor), game.maxDemoBetMinor);
}
