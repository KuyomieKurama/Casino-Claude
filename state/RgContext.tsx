"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { ResponsibleGaming } from "@/types/responsible-gaming";
import { writeSlice } from "@/lib/storage";
import { nowIso } from "@/lib/ids";
import { DEFAULT_REMINDER_INTERVAL_MINUTES } from "@/lib/constants";
import { usePersistence } from "./PersistenceContext";
import { createInitialRgState, getRgStatus, rgReducer, toPersistedRg, type RgState, type RgStatus } from "./rg-reducer";

type RgValue = {
  state: RgState;
  rg: ResponsibleGaming;
  hydrated: boolean;
  /** Status zum Zeitpunkt des Aufrufs — für Entscheidungen (Wallet), nicht für Anzeige. */
  getStatus: () => RgStatus;
  pause: (minutes: number) => void;
  endPause: () => void;
  setSessionLimit: (minutes: number | undefined) => void;
  setReminderInterval: (minutes: number) => void;
  selfExclude: () => void;
  liftSelfExclusion: () => void;
  markReminderShown: () => void;
  startNewSession: () => void;
};

const RgContext = createContext<RgValue | null>(null);

// Der Startwert wird beim ersten Render festgelegt; die Hydration überschreibt ihn.
const BOOT_ISO = "1970-01-01T00:00:00.000Z";

export function RgProvider({ children }: { children: ReactNode }) {
  const persistence = usePersistence();
  const [state, dispatch] = useReducer(rgReducer, BOOT_ISO, createInitialRgState);

  useEffect(() => {
    if (persistence.hydrated && !state.hydrated) {
      const now = nowIso();
      // Ohne gespeicherte Scheibe beginnt die Sitzung jetzt — nicht 1970.
      dispatch({
        type: "HYDRATE",
        slice: persistence.slices.rg ?? {
          rg: { sessionStartedAt: now, reminderIntervalMinutes: DEFAULT_REMINDER_INTERVAL_MINUTES, selfExcluded: false },
          lastActiveAt: now,
        },
        now,
      });
    }
  }, [persistence.hydrated, persistence.slices.rg, state.hydrated]);

  useEffect(() => {
    if (state.hydrated) writeSlice("rg", toPersistedRg(state));
  }, [state]);

  // Aktivitätsstempel: minütlich und beim Zurückkehren in den Tab (Zeitstempel, keine Zähler).
  useEffect(() => {
    if (!state.hydrated) return;
    const touch = () => {
      if (document.visibilityState === "visible") dispatch({ type: "TOUCH", now: nowIso() });
    };
    const id = setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", touch);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [state.hydrated]);

  const getStatus = useCallback(() => getRgStatus(state.rg, Date.now()), [state.rg]);
  const pause = useCallback((minutes: number) => dispatch({ type: "PAUSE", minutes, now: nowIso() }), []);
  const endPause = useCallback(() => dispatch({ type: "END_PAUSE", now: nowIso() }), []);
  const setSessionLimit = useCallback((minutes: number | undefined) => dispatch({ type: "SET_SESSION_LIMIT", minutes }), []);
  const setReminderInterval = useCallback((minutes: number) => dispatch({ type: "SET_REMINDER_INTERVAL", minutes }), []);
  const selfExclude = useCallback(() => dispatch({ type: "SELF_EXCLUDE", now: nowIso() }), []);
  const liftSelfExclusion = useCallback(() => dispatch({ type: "LIFT_SELF_EXCLUSION", now: nowIso() }), []);
  const markReminderShown = useCallback(() => dispatch({ type: "MARK_REMINDER_SHOWN", now: nowIso() }), []);
  const startNewSession = useCallback(() => dispatch({ type: "START_NEW_SESSION", now: nowIso() }), []);

  const value = useMemo<RgValue>(
    () => ({
      state,
      rg: state.rg,
      hydrated: state.hydrated,
      getStatus,
      pause,
      endPause,
      setSessionLimit,
      setReminderInterval,
      selfExclude,
      liftSelfExclusion,
      markReminderShown,
      startNewSession,
    }),
    [state, getStatus, pause, endPause, setSessionLimit, setReminderInterval, selfExclude, liftSelfExclusion, markReminderShown, startNewSession],
  );

  return <RgContext.Provider value={value}>{children}</RgContext.Provider>;
}

export function useRg(): RgValue {
  const v = useContext(RgContext);
  if (!v) throw new Error("useRg muss innerhalb von <RgProvider> verwendet werden.");
  return v;
}

/**
 * Live-Status mit lokalem Tick (Standard 1 s). Rechnet aus Zeitstempeln und bei
 * visibilitychange neu; rerendert nur die aufrufende Komponente, nicht den Provider.
 */
export function useRgStatus(tickMs = 1000): RgStatus & { hydrated: boolean } {
  const { rg, hydrated } = useRg();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    update();
    const id = setInterval(update, tickMs);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, [tickMs]);

  return useMemo(() => ({ ...getRgStatus(rg, nowMs), hydrated }), [rg, nowMs, hydrated]);
}
