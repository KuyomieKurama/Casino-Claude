import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { getSession } from "@/server/auth/guards";
import { startInteractiveRound, type StartInteractiveRoundData } from "@/server/rounds/interactive-round-service";
import { startInteractiveRoundRequestSchema } from "@/server/rounds/interactive-schemas";
import type { WalletRejectionCode } from "@/lib/wallet-policy";

/**
 * Rundenstart für die drei interaktiven Spielfamilien (Blackjack, Mines, Video Poker; Phase 3b,
 * Auftrag §1/§2). Eigener Endpunkt statt Erweiterung von `POST /api/rounds/start`: die Antwort
 * unterscheidet sich fundamental (offene Runde mit begrenzter Sicht vs. immer schon abgeschlossene
 * Runde) — eine Vermischung hätte den bestehenden, vollständig getesteten nicht-interaktiven Pfad
 * angefasst (app/api/rounds/start/route.ts, round-service.ts bleiben unverändert).
 *
 * `runtime = "nodejs"`: derselbe Grund wie bei /api/rounds/start — der `pg`-Treiber ist nicht
 * Edge-fähig.
 *
 * Anmeldepflicht (Auftrag „Spielen nur angemeldet"): wie /api/rounds/start — ohne gültige Sitzung
 * wird JEDE Anfrage mit 401 und UNAUTHENTICATED abgelehnt, kein Gastkonto mehr angelegt.
 */
export const runtime = "nodejs";

type RoundApiResponse = { success: true; data: StartInteractiveRoundData } | { success: false; error: WalletRejectionCode };

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

  const parsed = startInteractiveRoundRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ success: false, error: "INVALID_STAKE" }, 400);
  }

  // Autorisierung: die userId kommt ausschließlich aus der geprüften Sitzung — niemals aus dem
  // Request-Body (derselbe Grundsatz wie app/api/rounds/start/route.ts).
  const session = await getSession();
  if (!session) {
    return json({ success: false, error: "UNAUTHENTICATED" }, 401);
  }
  const userId = session.user.id;

  try {
    const result = await startInteractiveRound(db, {
      userId,
      gameModeId: parsed.data.gameModeId,
      stakeMinor: parsed.data.stakeMinor,
      idempotencyKey: parsed.data.idempotencyKey,
      ...(parsed.data.useFreeSpin === undefined ? {} : { useFreeSpin: parsed.data.useFreeSpin }),
      ...(parsed.data.betId === undefined ? {} : { betId: parsed.data.betId }),
    });
    return result.ok ? json({ success: true, data: result.data }, 200) : json({ success: false, error: result.code }, 200);
  } catch (error: unknown) {
    // Kein Stacktrace nach außen (CLAUDE.md, Fehlermeldungen: „ohne Stacktrace"). Serverseitig
    // bleibt der Fehler sichtbar (Plattform-Log), der Client sieht nur einen sachlichen Code.
    console.error("[api/rounds/interactive-start] unerwarteter Fehler:", error);
    return json({ success: false, error: "SERVER_ERROR" }, 500);
  }
}
