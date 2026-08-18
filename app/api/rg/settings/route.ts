import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { getSession } from "@/server/auth/guards";
import { rgSettingsRequestSchema } from "@/server/rg/schemas";
import { endPause, markReminderShown, pauseSession, setReminderInterval, setSessionLimit, startNewSession } from "@/server/rg/rg-settings-service";
import { nowIso } from "@/lib/ids";
import type { ResponsibleGaming } from "@/types/responsible-gaming";

/**
 * Nicht-kritische Responsible-Gaming-Einstellungen (Pause, Zeitlimit, Erinnerungsintervall,
 * Erinnerung quittieren, neue Sitzung beginnen) — ein Route Handler statt sechs, dieselbe
 * Begründung wie server/rg/schemas.ts (KISS/DRY). Selbstsperre lebt bewusst getrennt in
 * app/api/rg/self-exclusion/route.ts (kritische Aktion, eigener Zwei-Schritt-Ablauf).
 *
 * Autorisierung: die userId kommt ausschließlich aus der geprüften Sitzung — niemals aus dem
 * Request-Body. `server/rg/rg-settings-service.ts` übernimmt sie unverändert weiter, ohne sie
 * selbst zu bestimmen — ein Nutzer kann dadurch strukturell nur seine eigenen Einstellungen
 * ändern. Ohne Sitzung wird abgelehnt (401, UNAUTHENTICATED): die frühere Gastspiel-Mechanik
 * (server/auth/guests.ts + server/rounds/guest-session.ts), über die anonyme Besucher hier vorher
 * ein Gastkonto erhielten, ist mit „Spielen nur angemeldet" entfallen — Responsible-Gaming-
 * Einstellungen setzen dadurch dieselbe Anmeldung voraus wie das Spielen selbst.
 *
 * `runtime = "nodejs"`: derselbe Grund wie bei den Rundenendpunkten.
 */
export const runtime = "nodejs";

type SettingsErrorCode = "INVALID_INPUT" | "UNAUTHENTICATED" | "SERVER_ERROR";
type SettingsResponse = { success: true; data: { rg: ResponsibleGaming } } | { success: false; error: SettingsErrorCode };

function json(body: SettingsResponse, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ success: false, error: "INVALID_INPUT" }, 400);
  }

  const parsed = rgSettingsRequestSchema.safeParse(rawBody);
  if (!parsed.success) return json({ success: false, error: "INVALID_INPUT" }, 400);

  const session = await getSession();
  if (!session) {
    return json({ success: false, error: "UNAUTHENTICATED" }, 401);
  }
  const userId = session.user.id;

  try {
    const now = nowIso();
    const action = parsed.data;
    let rg: ResponsibleGaming;
    switch (action.action) {
      case "pause":
        rg = await pauseSession(db, userId, action.minutes, now);
        break;
      case "endPause":
        rg = await endPause(db, userId, now);
        break;
      case "setSessionLimit":
        rg = await setSessionLimit(db, userId, action.minutes, now);
        break;
      case "setReminderInterval":
        rg = await setReminderInterval(db, userId, action.minutes, now);
        break;
      case "markReminderShown":
        rg = await markReminderShown(db, userId, now);
        break;
      case "startNewSession":
        rg = await startNewSession(db, userId, now);
        break;
    }
    return json({ success: true, data: { rg } }, 200);
  } catch (error: unknown) {
    // Kein Stacktrace nach außen (CLAUDE.md, Fehlermeldungen: „ohne Stacktrace").
    console.error("[api/rg/settings] unerwarteter Fehler:", error);
    return json({ success: false, error: "SERVER_ERROR" }, 500);
  }
}
