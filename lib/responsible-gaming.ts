import type { ResponsibleGaming } from "@/types/responsible-gaming";

/**
 * Reine Responsible-Gaming-Entscheidungsregeln (Konzept §6/§8.9). Ursprünglich Teil von
 * `state/rg-reducer.ts` — hierher verschoben (Auftrag „Server statt Client"), weil `server/**`
 * laut Schichtregel (CLAUDE.md) nichts aus `state/**` importieren darf, `lib/**` aber von beiden
 * Seiten genutzt werden kann. Die Funktion selbst ist dabei UNVERÄNDERT geblieben — nur der Ort
 * hat sich geändert, damit Client (Anzeige, tickende Uhr) und Server (tatsächliche Durchsetzung,
 * `server/rg/**`) wortgleich dieselbe Entscheidung treffen, statt sie zu duplizieren.
 *
 * Zeitrechnung erfolgt ausschließlich aus ISO-Zeitstempeln (`sessionStartedAt`, `pausedUntil`,
 * `lastReminderAt`), nie aus Zählern — diese Eigenschaft bleibt an dieser Stelle erhalten,
 * unabhängig davon, ob `rg` clientseitig zusammengestellt oder serverseitig aus `rg_setting` +
 * `play_session` gelesen wurde (server/rg/rg-guard.ts).
 */

/** Wird eine Sitzung länger als so nicht berührt, beginnt beim nächsten Besuch eine neue. */
export const SESSION_GAP_MS = 30 * 60_000;

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
    title: "Zeitlimit erreicht",
    body: "Dein selbst gesetztes Zeitlimit für diese Sitzung ist erreicht. Spielstarts sind blockiert, bis du unter Responsible Gaming eine neue Sitzung beginnst.",
  },
};
