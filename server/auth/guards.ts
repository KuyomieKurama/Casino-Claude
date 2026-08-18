import "server-only";
import { headers as nextHeaders } from "next/headers";
import { auth } from "./index";
import type { VeloraAuth } from "./create-auth";

/**
 * Autorisierungshelfer für Server Components und Route Handler.
 *
 * Bewusst zwei unterscheidbare Fehlerklassen (statt einer generischen Exception): Aufrufende
 * Stellen können so gezielt auf „nicht angemeldet" (→ Login-Redirect) vs. „angemeldet, aber
 * nicht berechtigt" (→ 403-Seite) reagieren, ohne Fehlertexte zu parsen.
 */
export class UnauthenticatedError extends Error {
  constructor(message = "Nicht angemeldet. Was tun: Zuerst anmelden.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Keine Berechtigung für diese Aktion.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  isGuest: boolean;
}

export interface AuthSession {
  user: AuthenticatedUser;
  sessionId: string;
  expiresAt: Date;
}

function toAuthSession(raw: Awaited<ReturnType<VeloraAuth["api"]["getSession"]>>): AuthSession | null {
  if (!raw) return null;
  const user = raw.user as typeof raw.user & { role?: string; status?: string; isGuest?: boolean };
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? "user",
      status: user.status ?? "active",
      isGuest: user.isGuest ?? false,
    },
    sessionId: raw.session.id,
    expiresAt: raw.session.expiresAt,
  };
}

/**
 * Baut getSession()/requireUser()/requireAdmin() gegen eine gegebene better-auth-Instanz.
 * Fabrikfunktion (statt fest an `auth` aus ./index gebunden), damit Tests dieselben Prüfungen
 * gegen eine PGlite-Testinstanz (server/auth/create-auth.ts + server/db/test-harness.ts) laufen
 * lassen können. Der Rest der Anwendung nutzt die unten stehenden, an den Produktions-Singleton
 * gebundenen Exporte.
 */
export function createAuthGuards(authInstance: VeloraAuth) {
  /**
   * Liest die aktuelle Sitzung aus den Request-Headern (Session-Cookie). `null`, wenn niemand
   * angemeldet ist — wirft bewusst nicht, damit Aufrufstellen selbst entscheiden können, ob
   * eine fehlende Sitzung ein Fehler ist (requireUser()) oder ein normaler Zustand (z. B.
   * Startseite).
   *
   * `headers` ist optional und primär für Tests gedacht: Server Components/Route Handler rufen
   * `getSession()` ohne Argument auf und bekommen die echten Request-Header über
   * `next/headers()`; Tests übergeben stattdessen gezielt ein `Headers`-Objekt mit einem
   * Session-Cookie, ohne einen echten Next.js-Request-Kontext zu benötigen.
   */
  async function getSession(headers?: Headers): Promise<AuthSession | null> {
    const resolvedHeaders = headers ?? (await nextHeaders());
    const raw = await authInstance.api.getSession({ headers: resolvedHeaders });
    return toAuthSession(raw);
  }

  /** Wirft UnauthenticatedError, wenn niemand angemeldet ist; liefert sonst die Sitzung. */
  async function requireUser(headers?: Headers): Promise<AuthSession> {
    const session = await getSession(headers);
    if (!session) throw new UnauthenticatedError();
    return session;
  }

  /**
   * Wirft UnauthenticatedError (nicht angemeldet) oder UnauthorizedError (angemeldet, aber
   * kein aktiver Admin). Prüft `role === "admin"` UND `status === "active"` — ein gesperrter
   * Admin (`status: "disabled"`) darf keine Admin-Aktionen mehr ausführen, obwohl die Rolle
   * bestehen bleibt (Sperren soll nicht gleichbedeutend mit Rollenverlust sein, aber eben auch
   * nicht wirkungslos).
   */
  async function requireAdmin(headers?: Headers): Promise<AuthSession> {
    const session = await requireUser(headers);
    if (session.user.role !== "admin" || session.user.status !== "active") {
      throw new UnauthorizedError("Diese Aktion ist Admins mit aktivem Konto vorbehalten.");
    }
    return session;
  }

  return { getSession, requireUser, requireAdmin };
}

export const { getSession, requireUser, requireAdmin } = createAuthGuards(auth);
