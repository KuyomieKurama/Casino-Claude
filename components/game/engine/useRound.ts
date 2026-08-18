"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "@/types/game";
import type { RoundStatus } from "@/types/game-round";
import { useWallet } from "@/state/WalletContext";
import { useRgStatus } from "@/state/RgContext";
import { availableMinor, rejectionMessage, type WalletRejection } from "@/state/wallet-reducer";
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
   * Seit Phase 3b die einzige Betriebsart — einen lokalen, clientseitig gebuchten Rundenpfad gibt
   * es nicht mehr (Auftrag: „zwei Pfade zum Buchen von Guthaben sind eine dauerhafte
   * Fehlerquelle"). `play()` verlangt deshalb `server: true`, siehe dort.
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
  roundDurationMs,
  interactive = false,
  server = false,
  simulateLoadError = false,
  onStatusChange,
  defaultStakeMinor,
}: UseRoundOptions) {
  const { hydrated, wallet, lastRejection, clearRejection, syncServerWallet } = useWallet();
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
  /**
   * Doppelklick-Schutz für serverseitige Runden (Phase 3a): `canStart` stammt aus dem letzten
   * Render und ist bei mehreren Klicks im selben Task noch veraltet — ein Klick sähe also noch
   * den alten, unbelegten Zustand. Das Ergebnis kommt zudem erst asynchron zurück, es gibt also
   * keinen synchron aktuellen React-Zustand, der einen zweiten Klick im selben Task verlässlich
   * blockieren könnte — deshalb dieser Ref, der VOR dem `await` sofort auf `true` gesetzt wird.
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

  /**
   * Nicht-interaktive Engines: Start und Abschluss nach der Animationsdauer in einem Schritt.
   * Seit Phase 3b läuft das ausschließlich serverseitig — ein clientseitig gebuchter Rundenpfad
   * existiert nicht mehr (Auftrag: „zwei Pfade zum Buchen von Guthaben sind eine dauerhafte
   * Fehlerquelle"). `server: true` ist deshalb Pflicht; das Fehlen ist ein Programmierfehler in
   * der aufrufenden Engine, kein Nutzerzustand — kein stiller Fallback bei einer Geldbewegung.
   */
  const play = useCallback(() => {
    if (!server) {
      throw new Error("useRound: play() erfordert server: true — der lokale Rundenpfad wurde entfernt (Phase 3b).");
    }
    void playServer();
    return null;
  }, [server, playServer]);

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
    /** Echo der Options — true, wenn das Ergebnis erst durch Spielerentscheidungen feststeht. */
    interactive,
    // Aktionen
    load,
    play,
    togglePause,
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
