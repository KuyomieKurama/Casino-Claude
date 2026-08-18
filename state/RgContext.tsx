"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ResponsibleGaming } from "@/types/responsible-gaming";
import { nowIso } from "@/lib/ids";
import { DEFAULT_REMINDER_INTERVAL_MINUTES } from "@/lib/constants";
import { getRgStatus, type RgStatus } from "@/lib/responsible-gaming";
import { readLegacySelfExclusionFlag } from "@/lib/storage";
import {
  postRgActivateSelfExclusion,
  postRgConfirmLiftSelfExclusion,
  postRgEndPause,
  postRgMarkReminderShown,
  postRgPause,
  postRgRequestLiftSelfExclusion,
  postRgSetReminderInterval,
  postRgSetSessionLimit,
  postRgStartNewSession,
  postRgTouch,
} from "./rg-api-client";

/**
 * Responsible Gaming bezieht seinen Zustand vom Server (Auftrag „Server statt Client"):
 * Selbstsperre, Pause und Zeitlimit werden dort durchgesetzt (server/rg/**, server/rounds/*.ts),
 * nicht mehr nur hier angezeigt. Dieser Provider tickt lokal (Anzeige, `useRgStatus`) und
 * spiegelt `rg` — die ENTSCHEIDUNG, ob ein Rundenstart tatsächlich durchgeht, liegt beim Server.
 *
 * Kein LocalStorage mehr (SCHEMA_VERSION 4, lib/constants.ts): `rg` kommt initial als SSR-Prop
 * aus app/layout.tsx (server/rg/rg-read-model.ts), danach aus den Antworten der Mutationen unten
 * bzw. einem periodischen Heartbeat (`POST /api/rg/touch`) — dasselbe Muster wie
 * state/WalletContext.tsx mit `initialWallet`.
 */

type RgValue = {
  rg: ResponsibleGaming;
  hydrated: boolean;
  /** Status zum Zeitpunkt des Aufrufs — für Entscheidungen (z. B. UI-Gating), nicht für Anzeige. */
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

function defaultResponsibleGaming(): ResponsibleGaming {
  return { sessionStartedAt: nowIso(), reminderIntervalMinutes: DEFAULT_REMINDER_INTERVAL_MINUTES, selfExcluded: false };
}

export type RgProviderProps = {
  children: ReactNode;
  /**
   * Serverseitig gelesener RG-Stand (app/layout.tsx ⇒ server/rg/rg-read-model.ts), beim ersten
   * Render bereits bekannt — kein Nachladen, kein Skeleton (anders als früher: es gibt keine
   * LocalStorage-Hydration mehr, die abgewartet werden müsste). Ohne Prop (bestehende
   * Komponententests ohne Server-Kontext) gilt derselbe Standardzustand wie für einen brandneuen
   * Nutzer: keine Sperre, kein Limit, Sitzung beginnt jetzt.
   */
  initialRg?: ResponsibleGaming;
};

export function RgProvider({ children, initialRg }: RgProviderProps) {
  const [rg, setRg] = useState<ResponsibleGaming>(() => initialRg ?? defaultResponsibleGaming());

  const getStatus = useCallback((): RgStatus => getRgStatus(rg, Date.now()), [rg]);

  const applyResult = useCallback((result: { ok: true; rg: ResponsibleGaming } | { ok: false }) => {
    // Kein stiller Fallback bei einem Netzwerk-/Serverfehler: die Anzeige bleibt einfach beim
    // zuletzt bekannten Stand, statt einen geratenen neuen Wert zu übernehmen — dieselbe Regel
    // wie beim Rundenstart (useRound.ts zeigt eine sichtbare Ablehnung statt eines stillen Wechsels).
    if (result.ok) setRg(result.rg);
  }, []);

  const pause = useCallback((minutes: number) => {
    void postRgPause(minutes).then(applyResult);
  }, [applyResult]);
  const endPause = useCallback(() => {
    void postRgEndPause().then(applyResult);
  }, [applyResult]);
  const setSessionLimit = useCallback((minutes: number | undefined) => {
    void postRgSetSessionLimit(minutes ?? null).then(applyResult);
  }, [applyResult]);
  const setReminderInterval = useCallback((minutes: number) => {
    void postRgSetReminderInterval(minutes).then(applyResult);
  }, [applyResult]);
  const selfExclude = useCallback(() => {
    void postRgActivateSelfExclusion().then(applyResult);
  }, [applyResult]);
  /**
   * Zwei GETRENNTE Server-Aufrufe (Auftrag §3) — der zweite (`confirmLift`) wirkt nur, wenn der
   * erste (`requestLift`) tatsächlich vorausging. `state/rg-api-client.ts` bildet das 1:1 ab; ein
   * direkter API-Aufruf unter Umgehung dieser Funktion (also nur `confirmLift` allein) bewirkt
   * serverseitig nichts (server/repositories/rg-settings-repository.ts).
   */
  const liftSelfExclusion = useCallback(() => {
    void postRgRequestLiftSelfExclusion().then((requested) => {
      if (!requested.ok) return;
      void postRgConfirmLiftSelfExclusion().then(applyResult);
    });
  }, [applyResult]);
  const markReminderShown = useCallback(() => {
    void postRgMarkReminderShown().then(applyResult);
  }, [applyResult]);
  const startNewSession = useCallback(() => {
    void postRgStartNewSession().then(applyResult);
  }, [applyResult]);

  /**
   * Migration einer vor der Umstellung LOKAL gesetzten Selbstsperre (Auftrag: „darf durch die
   * Umstellung nicht verlorengehen … Nutzer nicht stillschweigend entsperrt"). Es gibt keine
   * echte Migration von LocalStorage in die Datenbank (siehe SCHEMA_VERSION-Kommentar,
   * lib/constants.ts) — ein alter Eintrag würde ohne diese Prüfung beim nächsten Laden einfach
   * verworfen, und der Server-Anfangszustand (`initialRg`) zeigt für einen Nutzer ohne eigene
   * `rg_setting`-Zeile „nicht gesperrt". Statt das unkommentiert hinzunehmen, wird ein gefundener
   * lokaler Sperrvermerk EINMALIG beim ersten Laden auf den Server übertragen — im Zweifel
   * bleibt der Nutzer gesperrt, statt unbemerkt freigeschaltet zu werden (dieselbe Regel wie
   * „kein stiller Fallback, der im Fehlerfall öffnet").
   */
  const legacyMigrationRan = useRef(false);
  useEffect(() => {
    if (legacyMigrationRan.current) return;
    legacyMigrationRan.current = true;
    if (rg.selfExcluded) return; // bereits serverseitig gesperrt — nichts zu tun
    if (!readLegacySelfExclusionFlag()) return;
    void postRgActivateSelfExclusion().then(applyResult);
    // Nur einmal beim ersten Client-Render prüfen — bewusst ohne `rg` als Abhängigkeit (der
    // Ref-Schutz übernimmt das „nur einmal", eine erneute Prüfung bei jeder rg-Änderung wäre
    // unnötig und könnte eine bewusste, gerade erst erfolgte Aufhebung sofort wieder aufheben).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat (Auftrag §4): zählt als Aktivität, dasselbe Intervall wie der frühere clientseitige
  // TOUCH-Dispatch (minütlich + beim Zurückkehren in den Tab) — nur jetzt gegen den Server.
  useEffect(() => {
    const touch = () => {
      if (document.visibilityState === "visible") void postRgTouch().then(applyResult);
    };
    const id = setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", touch);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [applyResult]);

  const value = useMemo<RgValue>(
    () => ({
      rg,
      hydrated: true,
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
    [rg, getStatus, pause, endPause, setSessionLimit, setReminderInterval, selfExclude, liftSelfExclusion, markReminderShown, startNewSession],
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
