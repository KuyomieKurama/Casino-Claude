import { NextResponse } from "next/server";
import { requireAdmin, UnauthenticatedError, UnauthorizedError, type AuthSession } from "@/server/auth/guards";

/**
 * Gemeinsame Klammer für alle `app/api/admin/**​/route.ts`-Handler (Admin-Auftrag „Übergreifend":
 * „läuft über requireAdmin(). Autorisierung im Service, nicht nur in der Seite."). Diese Datei
 * ist selbst KEIN Route Handler (kein `route.ts`) — Next.js registriert sie deshalb nicht als
 * eigenen Endpunkt.
 *
 * `withAdminSession` prüft VOR jedem Handler-Aufruf `requireAdmin()` (Rolle UND aktiver Status,
 * server/auth/guards.ts) und wandelt beide Fehlerklassen sowie jeden unerwarteten Fehler in eine
 * JSON-Antwort ohne Stacktrace um (CLAUDE.md: Fehlermeldungen „ohne Stacktrace").
 */
export type AdminApiResult<T> = { success: true; data: T } | { success: false; error: string };

export function adminJson<T>(body: AdminApiResult<T>, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function withAdminSession(handler: (session: AuthSession) => Promise<NextResponse>): Promise<NextResponse> {
  let session: AuthSession;
  try {
    session = await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthenticatedError) return adminJson({ success: false, error: "UNAUTHENTICATED" }, 401);
    if (error instanceof UnauthorizedError) return adminJson({ success: false, error: "UNAUTHORIZED" }, 403);
    throw error;
  }

  try {
    return await handler(session);
  } catch (error: unknown) {
    console.error("[admin-api] unerwarteter Fehler:", error);
    return adminJson({ success: false, error: "SERVER_ERROR" }, 500);
  }
}

/** Liest und parsed den JSON-Body defensiv — ein ungültiger Body ist ein INVALID_INPUT-Fehler, kein Serverfehler. */
export async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}
