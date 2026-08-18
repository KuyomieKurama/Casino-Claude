"use client";

import { useEffect, useRef } from "react";
import type { WalletRejection } from "@/state/wallet-reducer";
import type { LastRoundResult } from "../useRound";
import { useSound } from "./useEngineSound";
import { roundSettleSound } from "./roundSound";

/**
 * Gemeinsame Klanglogik aller Engines für Rundenabschluss und abgelehnte Aktionen.
 *
 * - Neues `last` (neue roundId) → genau einmal "win" (echter Netto-Gewinn) oder "settle"
 *   (Verlust/Push) — nie beides, nie mehrfach für dieselbe Runde. Der Ref-Wächter folgt
 *   demselben Muster wie BaccaratGame.tsx (`lastLogged`) für den Ergebnisverlauf.
 * - Neuer `inlineError` (neuer Zeitstempel `at`) → "error", z. B. bei unzureichendem Guthaben
 *   oder einer sonst abgelehnten Aktion.
 *
 * Kein eskalierender oder betonter Zwischenton während der Runde (Regel 7 / ENGINE-BRIEF.md):
 * Die Funktion reagiert ausschließlich auf den fertigen Zustand, nie auf Zwischenschritte einer
 * laufenden Runde.
 */
export function useRoundSettleSound(last: LastRoundResult | null, inlineError: WalletRejection | null | undefined): void {
  const { play } = useSound();
  const lastRoundId = useRef<string | null>(null);
  const lastErrorAt = useRef<string | null>(null);

  useEffect(() => {
    if (!last || lastRoundId.current === last.roundId) return;
    lastRoundId.current = last.roundId;
    play(roundSettleSound(last.netMinor));
  }, [last, play]);

  useEffect(() => {
    if (!inlineError || lastErrorAt.current === inlineError.at) return;
    lastErrorAt.current = inlineError.at;
    play("error");
  }, [inlineError, play]);
}
