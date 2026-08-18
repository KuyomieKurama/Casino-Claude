import type { AppDatabase } from "@/server/db/types";
import type { ResponsibleGaming } from "@/types/responsible-gaming";
import { RG_LIFT_CONFIRM_WINDOW_MS } from "@/lib/constants";
import {
  activateSelfExclusion,
  confirmLiftSelfExclusion,
  endPause as endPauseSettings,
  findOrCreateRgSettings,
  requestLiftSelfExclusion,
  setPause as setPauseSettings,
  setReminderIntervalMinutes,
  setSessionLimitMinutes,
} from "@/server/repositories/rg-settings-repository";
import { forceNewSession, markReminderShown as markReminderShownSession, touchPlaySession } from "@/server/repositories/play-session-repository";
import { composeResponsibleGaming } from "./compose";

/**
 * Orchestriert die Server Actions/Route Handler unter `app/api/rg/**`: jede Funktion nimmt
 * `userId` als eigenen Parameter (aus der geprüften Sitzung, NIE aus dem Request-Body — Auftrag
 * §3: „Ein Nutzer ändert ausschließlich seine eigenen Einstellungen"), ändert genau die eine
 * betroffene Tabelle und liefert danach den vollständigen, aktuellen `ResponsibleGaming`-Zustand
 * zurück (Einstellungen + aktive Sitzung), damit der Client seine Anzeige direkt aus der Antwort
 * aktualisieren kann, ohne einen zweiten Request zu brauchen.
 *
 * Jede Aktion zählt zugleich als Aktivität: `touchPlaySession`/`forceNewSession` läuft in jeder
 * Funktion mit, damit eine RG-Einstellung zu ändern dieselbe Wirkung auf die Sitzung hat wie eine
 * Runde zu starten.
 */

async function withCurrentSession(db: AppDatabase, userId: string, nowIso: string) {
  return touchPlaySession(db, userId, nowIso);
}

export async function pauseSession(db: AppDatabase, userId: string, minutes: number, nowIso: string): Promise<ResponsibleGaming> {
  const pausedUntilIso = new Date(Date.parse(nowIso) + minutes * 60_000).toISOString();
  const [settings, session] = await Promise.all([setPauseSettings(db, userId, pausedUntilIso), withCurrentSession(db, userId, nowIso)]);
  return composeResponsibleGaming(settings, session, nowIso);
}

export async function endPause(db: AppDatabase, userId: string, nowIso: string): Promise<ResponsibleGaming> {
  const [settings, session] = await Promise.all([endPauseSettings(db, userId), withCurrentSession(db, userId, nowIso)]);
  return composeResponsibleGaming(settings, session, nowIso);
}

export async function setSessionLimit(db: AppDatabase, userId: string, minutes: number | null, nowIso: string): Promise<ResponsibleGaming> {
  const [settings, session] = await Promise.all([setSessionLimitMinutes(db, userId, minutes), withCurrentSession(db, userId, nowIso)]);
  return composeResponsibleGaming(settings, session, nowIso);
}

export async function setReminderInterval(db: AppDatabase, userId: string, minutes: number, nowIso: string): Promise<ResponsibleGaming> {
  const [settings, session] = await Promise.all([setReminderIntervalMinutes(db, userId, minutes), withCurrentSession(db, userId, nowIso)]);
  return composeResponsibleGaming(settings, session, nowIso);
}

export async function markReminderShown(db: AppDatabase, userId: string, nowIso: string): Promise<ResponsibleGaming> {
  // Erst `touchPlaySession`, damit garantiert eine aktive Sitzung existiert (legt bei Bedarf eine
  // an) — erst danach kann `markReminderShownSession` sie zuverlässig finden und aktualisieren.
  const [settings] = await Promise.all([findOrCreateRgSettings(db, userId), touchPlaySession(db, userId, nowIso)]);
  const session = await markReminderShownSession(db, userId, nowIso);
  return composeResponsibleGaming(settings, session, nowIso);
}

export async function startNewSession(db: AppDatabase, userId: string, nowIso: string): Promise<ResponsibleGaming> {
  const [settings, session] = await Promise.all([findOrCreateRgSettings(db, userId), forceNewSession(db, userId, nowIso)]);
  return composeResponsibleGaming(settings, session, nowIso);
}

/** Wirkt sofort — ein einziger Aufruf genügt (Auftrag §3). */
export async function activateSelfExclusionAction(db: AppDatabase, userId: string, nowIso: string): Promise<ResponsibleGaming> {
  const [settings, session] = await Promise.all([activateSelfExclusion(db, userId, nowIso), withCurrentSession(db, userId, nowIso)]);
  return composeResponsibleGaming(settings, session, nowIso);
}

export type LiftResult = { ok: true; rg: ResponsibleGaming } | { ok: false };

/** Schritt 1 des Zwei-Schritt-Aufhebens — ändert `selfExcluded` noch nicht. */
export async function requestLiftSelfExclusionAction(db: AppDatabase, userId: string, nowIso: string): Promise<LiftResult> {
  const settings = await requestLiftSelfExclusion(db, userId, nowIso);
  if (!settings) return { ok: false };
  const session = await withCurrentSession(db, userId, nowIso);
  return { ok: true, rg: composeResponsibleGaming(settings, session, nowIso) };
}

/**
 * Schritt 2 — schlägt fehl (`ok: false`), wenn kein gültiger, noch nicht abgelaufener
 * `requestLift`-Aufruf vorausging (server/repositories/rg-settings-repository.ts). Das ist die
 * eigentliche Absicherung gegen einen direkten API-Aufruf, der den Zwei-Schritt-Dialog umgeht.
 */
export async function confirmLiftSelfExclusionAction(db: AppDatabase, userId: string, nowIso: string): Promise<LiftResult> {
  const settings = await confirmLiftSelfExclusion(db, userId, nowIso, RG_LIFT_CONFIRM_WINDOW_MS);
  if (!settings) return { ok: false };
  const session = await withCurrentSession(db, userId, nowIso);
  return { ok: true, rg: composeResponsibleGaming(settings, session, nowIso) };
}
