import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { getSession } from "@/server/auth/guards";
import { applyRoundAction, type ApplyActionData } from "@/server/rounds/round-action-service";
import { roundActionRequestSchema } from "@/server/rounds/interactive-schemas";
import type { WalletRejectionCode } from "@/lib/wallet-policy";

/**
 * Spieleraktionen einer laufenden interaktiven Runde (Phase 3b, Auftrag §2). Anders als bei den
 * beiden Rundenstart-Endpunkten wird hier NIE ein Gastkonto angelegt: eine Aktion setzt zwingend
 * voraus, dass bereits eine Runde unter einer bekannten `userId` existiert — ohne Sitzung kann es
 * also keine eigene offene Runde geben, ein Gastkonto an dieser Stelle wäre nur ein leerer Umweg.
 *
 * `runtime = "nodejs"`: derselbe Grund wie bei den übrigen Rundenendpunkten — der `pg`-Treiber ist
 * nicht Edge-fähig.
 */
export const runtime = "nodejs";

type RoundActionApiResponse = { success: true; data: ApplyActionData } | { success: false; error: WalletRejectionCode };

function json(body: RoundActionApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: roundId } = await context.params;

  const session = await getSession();
  if (!session) {
    // Dieselbe Ablehnung wie „Runde nicht gefunden" (round-action-service.ts) — kein Rückschluss
    // darauf, ob überhaupt eine Runde mit dieser ID existiert.
    return json({ success: false, error: "NO_PENDING_ROUND" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ success: false, error: "INVALID_STAKE" }, 400);
  }

  const parsed = roundActionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ success: false, error: "INVALID_STAKE" }, 400);
  }

  try {
    const result = await applyRoundAction(db, {
      userId: session.user.id,
      roundId,
      seq: parsed.data.seq,
      action: parsed.data.action,
      payload: parsed.data.payload,
    });
    return result.ok ? json({ success: true, data: result.data }, 200) : json({ success: false, error: result.code }, 200);
  } catch (error: unknown) {
    // Kein Stacktrace nach außen (CLAUDE.md, Fehlermeldungen: „ohne Stacktrace").
    console.error("[api/rounds/:id/actions] unerwarteter Fehler:", error);
    return json({ success: false, error: "SERVER_ERROR" }, 500);
  }
}
