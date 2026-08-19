import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { getSession } from "@/server/auth/guards";
import { applyRoundAction, type ApplyActionData } from "@/server/rounds/round-action-service";
import { roundActionRequestSchema } from "@/server/rounds/interactive-schemas";
import type { WalletRejectionCode } from "@/lib/wallet-policy";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

// Stacktrace nur außerhalb der Produktion: lib/logger.ts kann NODE_ENV nicht selbst lesen
// (process.env ist ausschließlich in lib/env.ts erlaubt), deshalb wird der bereits validierte
// Wert hier als Parameter übergeben.
const logger = createLogger({ includeStack: env.NODE_ENV !== "production" });

/**
 * Spieleraktionen einer laufenden interaktiven Runde (Phase 3b, Auftrag §2). Anmeldepflicht
 * (Auftrag „Spielen nur angemeldet"): ohne Sitzung wird JEDE Anfrage mit 401 und dem
 * eigenständigen Code UNAUTHENTICATED abgelehnt — nicht mit NO_PENDING_ROUND (das würde eine
 * fehlende Sitzung mit einer fehlenden/fremden Runde vermengen, obwohl die Oberfläche beide
 * Fälle unterschiedlich behandeln muss: NO_PENDING_ROUND ist ein Fachentscheid über eine bereits
 * bekannte Runde, UNAUTHENTICATED das Fehlen eines Kontos selbst). Es wird hier ohnehin NIE ein
 * Gastkonto angelegt (die frühere Gastspiel-Mechanik ist entfernt): eine Aktion setzt zwingend
 * voraus, dass bereits eine Runde unter einer bekannten `userId` existiert.
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
    return json({ success: false, error: "UNAUTHENTICATED" }, 401);
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
    logger.error("Unerwarteter Fehler bei einer Rundenaktion", { route: "api/rounds/:id/actions", roundId, userId: session.user.id, error });
    return json({ success: false, error: "SERVER_ERROR" }, 500);
  }
}
