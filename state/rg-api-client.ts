import type { ResponsibleGaming } from "@/types/responsible-gaming";

/**
 * Fetch-Client für `app/api/rg/**` — dasselbe Muster wie
 * `components/game/engine/round-api-client.ts`: nur `fetch` und eigene, kleine Antworttypen,
 * kein Import aus `@/server/*` (Schichtregel, CLAUDE.md). Die Antwort ist externe, nicht
 * vertrauenswürdige Eingabe und wird deshalb mit einfachen Typprüfungen genarnt, nicht ungeprüft
 * durchgereicht (coding-style.md „Never trust external data").
 */

export type RgApiResult = { ok: true; rg: ResponsibleGaming } | { ok: false };

function isResponsibleGaming(value: unknown): value is ResponsibleGaming {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.sessionStartedAt === "string" && typeof v.reminderIntervalMinutes === "number" && typeof v.selfExcluded === "boolean";
}

async function postRg(path: string, body: unknown): Promise<RgApiResult> {
  try {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const parsed: unknown = await response.json();
    if (typeof parsed !== "object" || parsed === null) return { ok: false };
    const v = parsed as Record<string, unknown>;
    if (v.success === true && typeof v.data === "object" && v.data !== null && isResponsibleGaming((v.data as Record<string, unknown>).rg)) {
      return { ok: true, rg: (v.data as { rg: ResponsibleGaming }).rg };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Heartbeat: zählt als Aktivität, schreibt die Spielsitzung fort (server/repositories/play-session-repository.ts). */
export function postRgTouch(): Promise<RgApiResult> {
  return postRg("/api/rg/touch", {});
}

export function postRgPause(minutes: number): Promise<RgApiResult> {
  return postRg("/api/rg/settings", { action: "pause", minutes });
}

export function postRgEndPause(): Promise<RgApiResult> {
  return postRg("/api/rg/settings", { action: "endPause" });
}

export function postRgSetSessionLimit(minutes: number | null): Promise<RgApiResult> {
  return postRg("/api/rg/settings", { action: "setSessionLimit", minutes });
}

export function postRgSetReminderInterval(minutes: number): Promise<RgApiResult> {
  return postRg("/api/rg/settings", { action: "setReminderInterval", minutes });
}

export function postRgMarkReminderShown(): Promise<RgApiResult> {
  return postRg("/api/rg/settings", { action: "markReminderShown" });
}

export function postRgStartNewSession(): Promise<RgApiResult> {
  return postRg("/api/rg/settings", { action: "startNewSession" });
}

export function postRgActivateSelfExclusion(): Promise<RgApiResult> {
  return postRg("/api/rg/self-exclusion", { action: "activate" });
}

/**
 * Zwei GETRENNTE Aufrufe (Auftrag §3): `liftSelfExclusion()` in `state/RgContext.tsx` ruft
 * `postRgRequestLiftSelfExclusion()` und erst danach `postRgConfirmLiftSelfExclusion()` auf — ein
 * einzelner Aufruf einer der beiden Funktionen allein hebt serverseitig nichts auf
 * (server/repositories/rg-settings-repository.ts::confirmLiftSelfExclusion).
 */
export function postRgRequestLiftSelfExclusion(): Promise<RgApiResult> {
  return postRg("/api/rg/self-exclusion", { action: "requestLift" });
}

export function postRgConfirmLiftSelfExclusion(): Promise<RgApiResult> {
  return postRg("/api/rg/self-exclusion", { action: "confirmLift" });
}
