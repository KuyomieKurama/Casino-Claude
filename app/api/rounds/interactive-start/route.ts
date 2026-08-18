import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { auth } from "@/server/auth";
import { getSession } from "@/server/auth/guards";
import { startGuestSession } from "@/server/rounds/guest-session";
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
 */
export const runtime = "nodejs";

type RoundApiResponse = { success: true; data: StartInteractiveRoundData } | { success: false; error: WalletRejectionCode };

function jsonWithCookie(body: RoundApiResponse, status: number, setCookieHeader: string | null): NextResponse {
  const response = NextResponse.json(body, { status });
  if (setCookieHeader) response.headers.append("set-cookie", setCookieHeader);
  return response;
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonWithCookie({ success: false, error: "INVALID_STAKE" }, 400, null);
  }

  const parsed = startInteractiveRoundRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonWithCookie({ success: false, error: "INVALID_STAKE" }, 400, null);
  }

  // Autorisierung: die userId kommt ausschließlich aus der geprüften Sitzung (oder einem hier
  // frisch angelegten Gastkonto) — niemals aus dem Request-Body (derselbe Grundsatz wie
  // app/api/rounds/start/route.ts).
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
    const result = await startInteractiveRound(db, {
      userId,
      gameModeId: parsed.data.gameModeId,
      stakeMinor: parsed.data.stakeMinor,
      idempotencyKey: parsed.data.idempotencyKey,
      ...(parsed.data.useFreeSpin === undefined ? {} : { useFreeSpin: parsed.data.useFreeSpin }),
      ...(parsed.data.betId === undefined ? {} : { betId: parsed.data.betId }),
    });
    return result.ok
      ? jsonWithCookie({ success: true, data: result.data }, 200, setCookieHeader)
      : jsonWithCookie({ success: false, error: result.code }, 200, setCookieHeader);
  } catch (error: unknown) {
    // Kein Stacktrace nach außen (CLAUDE.md, Fehlermeldungen: „ohne Stacktrace"). Serverseitig
    // bleibt der Fehler sichtbar (Plattform-Log), der Client sieht nur einen sachlichen Code.
    console.error("[api/rounds/interactive-start] unerwarteter Fehler:", error);
    return jsonWithCookie({ success: false, error: "SERVER_ERROR" }, 500, setCookieHeader);
  }
}
