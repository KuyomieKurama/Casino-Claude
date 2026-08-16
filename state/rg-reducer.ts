import type { ResponsibleGaming } from "@/types/responsible-gaming";
import { DEFAULT_REMINDER_INTERVAL_MINUTES } from "@/lib/constants";

/**
 * Responsible-Gaming-Reducer. Zeit wird immer aus Zeitstempeln berechnet (§6),
 * nie aus Intervall-Zählern. Selbstsperre und Pause blockieren tatsächlich — der
 * Wallet-Reducer bekommt daraus `rgBlocked` und lehnt einsatzbezogene Aktionen ab.
 */

/** Wird eine Sitzung länger als so nicht berührt, beginnt beim nächsten Besuch eine neue. */
export const SESSION_GAP_MS = 30 * 60_000;

export type RgState = {
  hydrated: boolean;
  rg: ResponsibleGaming;
  lastActiveAt: string;
};

export type RgAction =
  | { type: "HYDRATE"; slice: unknown; now: string }
  | { type: "TOUCH"; now: string }
  | { type: "PAUSE"; minutes: number; now: string }
  | { type: "END_PAUSE"; now: string }
  | { type: "SET_SESSION_LIMIT"; minutes: number | undefined }
  | { type: "SET_REMINDER_INTERVAL"; minutes: number }
  | { type: "SELF_EXCLUDE"; now: string }
  | { type: "LIFT_SELF_EXCLUSION"; now: string }
  | { type: "MARK_REMINDER_SHOWN"; now: string }
  | { type: "START_NEW_SESSION"; now: string };

export function createInitialRgState(now: string): RgState {
  return {
    hydrated: false,
    rg: {
      sessionStartedAt: now,
      reminderIntervalMinutes: DEFAULT_REMINDER_INTERVAL_MINUTES,
      selfExcluded: false,
    },
    lastActiveAt: now,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseRg(v: unknown): ResponsibleGaming | null {
  if (!isRecord(v)) return null;
  if (typeof v.sessionStartedAt !== "string" || typeof v.reminderIntervalMinutes !== "number") return null;
  return {
    sessionStartedAt: v.sessionStartedAt,
    reminderIntervalMinutes: v.reminderIntervalMinutes,
    selfExcluded: v.selfExcluded === true,
    ...(typeof v.sessionLimitMinutes === "number" ? { sessionLimitMinutes: v.sessionLimitMinutes } : {}),
    ...(typeof v.pausedUntil === "string" ? { pausedUntil: v.pausedUntil } : {}),
    ...(typeof v.lastReminderAt === "string" ? { lastReminderAt: v.lastReminderAt } : {}),
  };
}

export function toPersistedRg(state: RgState) {
  return { rg: state.rg, lastActiveAt: state.lastActiveAt };
}

export function rgReducer(state: RgState, action: RgAction): RgState {
  switch (action.type) {
    case "HYDRATE": {
      if (!isRecord(action.slice)) return { ...state, hydrated: true };
      const rg = parseRg(action.slice.rg);
      if (!rg) return { ...state, hydrated: true };
      const lastActiveAt = typeof action.slice.lastActiveAt === "string" ? action.slice.lastActiveAt : action.now;
      const gap = Date.parse(action.now) - Date.parse(lastActiveAt);
      // Nach längerer Abwesenheit beginnt eine neue Sitzung; Sperre, Pause und Limits bleiben erhalten.
      const sessionStartedAt = Number.isFinite(gap) && gap > SESSION_GAP_MS ? action.now : rg.sessionStartedAt;
      const next: ResponsibleGaming = { ...rg, sessionStartedAt };
      if (sessionStartedAt === action.now) delete next.lastReminderAt;
      return { hydrated: true, rg: next, lastActiveAt: action.now };
    }
    case "TOUCH":
      return state.lastActiveAt === action.now ? state : { ...state, lastActiveAt: action.now };
    case "PAUSE": {
      const minutes = Math.max(1, Math.floor(action.minutes));
      const until = new Date(Date.parse(action.now) + minutes * 60_000).toISOString();
      return { ...state, rg: { ...state.rg, pausedUntil: until }, lastActiveAt: action.now };
    }
    case "END_PAUSE": {
      const rg = { ...state.rg };
      delete rg.pausedUntil;
      return { ...state, rg, lastActiveAt: action.now };
    }
    case "SET_SESSION_LIMIT": {
      const rg = { ...state.rg };
      if (action.minutes && action.minutes > 0) rg.sessionLimitMinutes = Math.floor(action.minutes);
      else delete rg.sessionLimitMinutes;
      return { ...state, rg };
    }
    case "SET_REMINDER_INTERVAL":
      return { ...state, rg: { ...state.rg, reminderIntervalMinutes: Math.max(5, Math.floor(action.minutes)) } };
    case "SELF_EXCLUDE":
      return { ...state, rg: { ...state.rg, selfExcluded: true }, lastActiveAt: action.now };
    case "LIFT_SELF_EXCLUSION":
      return { ...state, rg: { ...state.rg, selfExcluded: false }, lastActiveAt: action.now };
    case "MARK_REMINDER_SHOWN":
      return { ...state, rg: { ...state.rg, lastReminderAt: action.now } };
    case "START_NEW_SESSION": {
      const rg = { ...state.rg, sessionStartedAt: action.now };
      delete rg.lastReminderAt;
      return { ...state, rg, lastActiveAt: action.now };
    }
    default:
      return state;
  }
}

// ─── Selektoren ─────────────────────────────────────────────────────────────

export type RgBlockReason = "self-excluded" | "paused" | "limit-reached";

export type RgStatus = {
  blocked: boolean;
  reason?: RgBlockReason;
  pausedUntil?: string;
  sessionElapsedMs: number;
  sessionRemainingMs?: number;
  reminderDue: boolean;
};

export function getRgStatus(rg: ResponsibleGaming, nowMs: number): RgStatus {
  const started = Date.parse(rg.sessionStartedAt);
  const sessionElapsedMs = Number.isFinite(started) ? Math.max(0, nowMs - started) : 0;
  const limitMs = rg.sessionLimitMinutes ? rg.sessionLimitMinutes * 60_000 : undefined;
  const sessionRemainingMs = limitMs !== undefined ? Math.max(0, limitMs - sessionElapsedMs) : undefined;

  const lastReminder = rg.lastReminderAt ? Date.parse(rg.lastReminderAt) : started;
  const reminderDue =
    rg.reminderIntervalMinutes > 0 && nowMs - lastReminder >= rg.reminderIntervalMinutes * 60_000;

  const base = { sessionElapsedMs, reminderDue, ...(sessionRemainingMs !== undefined ? { sessionRemainingMs } : {}) };

  if (rg.selfExcluded) return { ...base, blocked: true, reason: "self-excluded" };
  if (rg.pausedUntil && Date.parse(rg.pausedUntil) > nowMs) {
    return { ...base, blocked: true, reason: "paused", pausedUntil: rg.pausedUntil };
  }
  if (limitMs !== undefined && sessionElapsedMs >= limitMs) return { ...base, blocked: true, reason: "limit-reached" };
  return { ...base, blocked: false };
}

export const rgReasonText: Record<RgBlockReason, { title: string; body: string }> = {
  "self-excluded": {
    title: "Selbstsperre aktiv",
    body: "Du hast dich selbst gesperrt. Spielstarts sind blockiert, bis du die Sperre im Bereich Responsible Gaming ausdrücklich aufhebst.",
  },
  paused: {
    title: "Spielpause aktiv",
    body: "Du hast eine Pause eingelegt. Spielstarts sind bis zum Ende der Pause blockiert.",
  },
  "limit-reached": {
    title: "Demo-Zeitlimit erreicht",
    body: "Dein selbst gesetztes Zeitlimit für diese Sitzung ist erreicht. Spielstarts sind blockiert, bis du unter Responsible Gaming eine neue Sitzung beginnst.",
  },
};
