"use client";

import { useEffect, useRef } from "react";
import type { LastRoundResult } from "../useRound";
import { useSound } from "./useEngineSound";

/**
 * "stop" beim Anhalten von Walze, Rad oder Kessel (Slots, Wheel, Roulette) — genau einmal je
 * neuem Rundenergebnis, unabhängig vom Ausgang. Kein Zwischenton während der Animation und keine
 * Betonung eines Beinahe-Treffers (Regel 7): Der Ton markiert ausschließlich den fertigen
 * Zustand nach Rundenende, nie eine Zwischenposition während des Laufs.
 */
export function useReelStopSound(last: LastRoundResult | null): void {
  const { play } = useSound();
  const lastRoundId = useRef<string | null>(null);

  useEffect(() => {
    if (!last || lastRoundId.current === last.roundId) return;
    lastRoundId.current = last.roundId;
    play("stop");
  }, [last, play]);
}
