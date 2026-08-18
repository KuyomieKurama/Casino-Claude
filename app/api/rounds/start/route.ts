import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { auth } from "@/server/auth";
import { getSession } from "@/server/auth/guards";
import { startGuestSession } from "@/server/rounds/guest-session";
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
 */
export const runtime = "nodejs";

type RoundApiResponse = { success: true; data: StartRoundData } | { success: false; error: WalletRejectionCode };

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

  const parsed = startRoundRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonWithCookie({ success: false, error: "INVALID_STAKE" }, 400, null);
  }

  // Autorisierung: die userId kommt ausschließlich aus der geprüften Sitzung (oder einem hier
  // frisch angelegten Gastkonto) — niemals aus dem Request-Body. server/rounds/round-service.ts
  // übernimmt sie unverändert weiter, ohne sie selbst zu bestimmen.
  let userId: string;
  let setCookieHeader: string | null = null;
  const session = await getSession();
  if (session) {
    userId = session.user.id;
  } else {
    // Gastspiel (Auftrag §6): erster Rundenstart ohne Sitzung legt ein Gastkonto an und bindet
    // es über das Antwort-Cookie an den Browser.
    const guest = await startGuestSession(db, auth);
    userId = guest.userId;
    setCookieHeader = guest.setCookieHeader;
  }

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
    return result.ok
      ? jsonWithCookie({ success: true, data: result.data }, 200, setCookieHeader)
      : jsonWithCookie({ success: false, error: result.code }, 200, setCookieHeader);
  } catch (error: unknown) {
    // Kein Stacktrace nach außen (CLAUDE.md, Fehlermeldungen: „ohne Stacktrace"). Serverseitig
    // bleibt der Fehler sichtbar (Plattform-Log), der Client sieht nur einen sachlichen Code.
    console.error("[api/rounds/start] unerwarteter Fehler:", error);
    return jsonWithCookie({ success: false, error: "SERVER_ERROR" }, 500, setCookieHeader);
  }
}
