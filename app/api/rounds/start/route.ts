import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { getSession } from "@/server/auth/guards";
import { startNonInteractiveRound, type StartRoundData } from "@/server/rounds/round-service";
import { startRoundRequestSchema } from "@/server/rounds/schemas";
import type { WalletRejectionCode } from "@/lib/wallet-policy";

/**
 * Rundenstart für die sechs nicht-interaktiven Spielfamilien (Auftrag §3). `runtime = "nodejs"`:
 * derselbe Grund wie app/api/auth/[...all]/route.ts — der `pg`-Treiber ist nicht Edge-fähig.
 *
 * Antwortformat einheitlich `{ success, data?, error? }` (Auftrag §3); `error` ist immer einer
 * der bestehenden `WalletRejectionCode`-Werte, damit der Client dieselben deutschen Meldungen
 * weiterverwenden kann (state/wallet-reducer.ts::rejectionMessage).
 *
 * Anmeldepflicht (Auftrag „Spielen nur angemeldet"): ohne gültige Sitzung wird JEDE Anfrage mit
 * 401 und dem eigenständigen Code UNAUTHENTICATED abgelehnt — kein Gastkonto wird mehr angelegt
 * (die frühere Gastspiel-Mechanik, server/auth/guests.ts + server/rounds/guest-session.ts, wurde
 * entfernt). Die eigentliche Durchsetzung passiert HIER, vor jedem Aufruf von
 * server/rounds/round-service.ts — der Service selbst nimmt weiterhin keine Autorisierungs-
 * entscheidung vor, sondern verlangt eine bereits geprüfte `userId`.
 */
export const runtime = "nodejs";

type RoundApiResponse = { success: true; data: StartRoundData } | { success: false; error: WalletRejectionCode };

function json(body: RoundApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ success: false, error: "INVALID_STAKE" }, 400);
  }

  const parsed = startRoundRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ success: false, error: "INVALID_STAKE" }, 400);
  }

  // Autorisierung: die userId kommt ausschließlich aus der geprüften Sitzung — niemals aus dem
  // Request-Body. server/rounds/round-service.ts übernimmt sie unverändert weiter, ohne sie
  // selbst zu bestimmen.
  const session = await getSession();
  if (!session) {
    return json({ success: false, error: "UNAUTHENTICATED" }, 401);
  }
  const userId = session.user.id;

  try {
    const result = await startNonInteractiveRound(db, {
      userId,
      gameModeId: parsed.data.gameModeId,
      stakeMinor: parsed.data.stakeMinor,
      idempotencyKey: parsed.data.idempotencyKey,
      ...(parsed.data.useFreeSpin === undefined ? {} : { useFreeSpin: parsed.data.useFreeSpin }),
      ...(parsed.data.betId === undefined ? {} : { betId: parsed.data.betId }),
      ...(parsed.data.bet === undefined ? {} : { bet: parsed.data.bet }),
    });
    return result.ok ? json({ success: true, data: result.data }, 200) : json({ success: false, error: result.code }, 200);
  } catch (error: unknown) {
    // Kein Stacktrace nach außen (CLAUDE.md, Fehlermeldungen: „ohne Stacktrace"). Serverseitig
    // bleibt der Fehler sichtbar (Plattform-Log), der Client sieht nur einen sachlichen Code.
    console.error("[api/rounds/start] unerwarteter Fehler:", error);
    return json({ success: false, error: "SERVER_ERROR" }, 500);
  }
}
