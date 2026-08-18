import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { auth } from "@/server/auth";
import { getSession } from "@/server/auth/guards";
import { startGuestSession } from "@/server/rounds/guest-session";
import { rgSelfExclusionRequestSchema } from "@/server/rg/schemas";
import { activateSelfExclusionAction, confirmLiftSelfExclusionAction, requestLiftSelfExclusionAction } from "@/server/rg/rg-settings-service";
import { nowIso } from "@/lib/ids";
import type { ResponsibleGaming } from "@/types/responsible-gaming";

/**
 * Selbstsperre — die kritische Aktion (Auftrag §3), eigens von den übrigen Einstellungen
 * getrennt (app/api/rg/settings/route.ts): `activate` wirkt mit einem einzigen Aufruf sofort;
 * das Aufheben verlangt zwei GETRENNTE Aufrufe (`requestLift`, dann `confirmLift`) — der
 * eigentliche Schutz dahinter steckt in `server/repositories/rg-settings-repository.ts`
 * (`confirmLiftSelfExclusion`: die WHERE-Bedingung des UPDATEs prüft gegen den Datenbankstand,
 * nicht gegen einen vom Client behaupteten Wert). Ein isolierter `confirmLift`-Aufruf ohne
 * vorausgehenden `requestLift` bewirkt hier NICHTS, auch nicht bei einem direkten API-Aufruf
 * unter Umgehung des Zwei-Schritt-Dialogs (components/rg/LimitDialog.tsx).
 *
 * Autorisierung wie app/api/rg/settings/route.ts: userId ausschließlich aus der geprüften
 * Sitzung oder einem hier frisch angelegten Gastkonto — niemals aus dem Request-Body.
 */
export const runtime = "nodejs";

type SelfExclusionErrorCode = "INVALID_INPUT" | "LIFT_NOT_CONFIRMABLE" | "SERVER_ERROR";
type SelfExclusionResponse = { success: true; data: { rg: ResponsibleGaming } } | { success: false; error: SelfExclusionErrorCode };

function jsonWithCookie(body: SelfExclusionResponse, status: number, setCookieHeader: string | null): NextResponse {
  const response = NextResponse.json(body, { status });
  if (setCookieHeader) response.headers.append("set-cookie", setCookieHeader);
  return response;
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonWithCookie({ success: false, error: "INVALID_INPUT" }, 400, null);
  }

  const parsed = rgSelfExclusionRequestSchema.safeParse(rawBody);
  if (!parsed.success) return jsonWithCookie({ success: false, error: "INVALID_INPUT" }, 400, null);

  let userId: string;
  let setCookieHeader: string | null = null;
  const session = await getSession();
  if (session) {
    userId = session.user.id;
  } else {
    const guest = await startGuestSession(db, auth);
    userId = guest.userId;
    setCookieHeader = guest.setCookieHeader;
  }

  try {
    const now = nowIso();
    const action = parsed.data;
    if (action.action === "activate") {
      const rg = await activateSelfExclusionAction(db, userId, now);
      return jsonWithCookie({ success: true, data: { rg } }, 200, setCookieHeader);
    }
    const result = action.action === "requestLift" ? await requestLiftSelfExclusionAction(db, userId, now) : await confirmLiftSelfExclusionAction(db, userId, now);
    if (!result.ok) {
      // Kein Fachfehler wie RG_BLOCKED (WalletRejectionCode) — dieser Code beschreibt einen
      // eigenständigen Zustand: „diese Aufhebungsanfrage lässt sich gerade nicht bestätigen"
      // (keine bestehende Sperre, kein vorheriger requestLift, oder das Zeitfenster ist abgelaufen).
      return jsonWithCookie({ success: false, error: "LIFT_NOT_CONFIRMABLE" }, 200, setCookieHeader);
    }
    return jsonWithCookie({ success: true, data: { rg: result.rg } }, 200, setCookieHeader);
  } catch (error: unknown) {
    console.error("[api/rg/self-exclusion] unerwarteter Fehler:", error);
    return jsonWithCookie({ success: false, error: "SERVER_ERROR" }, 500, setCookieHeader);
  }
}
