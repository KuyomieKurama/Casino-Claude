import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { getSession } from "@/server/auth/guards";
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
 * Sitzung — niemals aus dem Request-Body. Ohne Sitzung wird abgelehnt (401, UNAUTHENTICATED);
 * die frühere Gastspiel-Mechanik ist mit „Spielen nur angemeldet" entfallen.
 */
export const runtime = "nodejs";

type SelfExclusionErrorCode = "INVALID_INPUT" | "UNAUTHENTICATED" | "LIFT_NOT_CONFIRMABLE" | "SERVER_ERROR";
type SelfExclusionResponse = { success: true; data: { rg: ResponsibleGaming } } | { success: false; error: SelfExclusionErrorCode };

function json(body: SelfExclusionResponse, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ success: false, error: "INVALID_INPUT" }, 400);
  }

  const parsed = rgSelfExclusionRequestSchema.safeParse(rawBody);
  if (!parsed.success) return json({ success: false, error: "INVALID_INPUT" }, 400);

  const session = await getSession();
  if (!session) {
    return json({ success: false, error: "UNAUTHENTICATED" }, 401);
  }
  const userId = session.user.id;

  try {
    const now = nowIso();
    const action = parsed.data;
    if (action.action === "activate") {
      const rg = await activateSelfExclusionAction(db, userId, now);
      return json({ success: true, data: { rg } }, 200);
    }
    const result = action.action === "requestLift" ? await requestLiftSelfExclusionAction(db, userId, now) : await confirmLiftSelfExclusionAction(db, userId, now);
    if (!result.ok) {
      // Kein Fachfehler wie RG_BLOCKED (WalletRejectionCode) — dieser Code beschreibt einen
      // eigenständigen Zustand: „diese Aufhebungsanfrage lässt sich gerade nicht bestätigen"
      // (keine bestehende Sperre, kein vorheriger requestLift, oder das Zeitfenster ist abgelaufen).
      return json({ success: false, error: "LIFT_NOT_CONFIRMABLE" }, 200);
    }
    return json({ success: true, data: { rg: result.rg } }, 200);
  } catch (error: unknown) {
    console.error("[api/rg/self-exclusion] unerwarteter Fehler:", error);
    return json({ success: false, error: "SERVER_ERROR" }, 500);
  }
}
