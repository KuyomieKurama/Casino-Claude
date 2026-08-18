import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { loginAttempt } from "@/server/db/auth-schema";
import type { LoginAttemptSubjectKind } from "@/server/db/enums";
import { env } from "@/lib/env";

/**
 * Gestaffeltes Rate Limiting für den Passwort-Login (Auftrag §5), über die eigene
 * `login_attempt`-Tabelle statt über better-auths eingebauten (pfad+IP-basierten) Rate-Limiter —
 * der bildet keine getrennten Fenster pro E-Mail UND pro IP ab und würde die IP zudem im
 * Klartext in seiner eigenen `rateLimit`-Tabelle ablegen.
 *
 * Warum ein Hash statt des Rohwerts für BEIDE Subjekt-Arten (nicht nur IP): Die Spalte
 * `subject_hash` ist bewusst einheitlich benannt — sowohl die IP (laut Auftrag zwingend) als
 * auch die E-Mail werden gehasht abgelegt, damit die Tabelle auch bei Kompromittierung keine
 * Klartext-PII preisgibt.
 *
 * Warum HMAC-SHA-256 statt einfachem SHA-256 (Nachtrag zum Security-Review): Der Eingaberaum
 * einer IPv4-Adresse (2^32) oder einer E-Mail-Adresse ist klein genug, dass ein ungesalzenes
 * SHA-256 innerhalb von Sekunden vollständig rückrechenbar wäre (Rainbow-Table über alle IPv4-
 * Adressen) — bei Kompromittierung der Tabelle wären damit sämtliche IP-Adressen und ggf.
 * E-Mail-Adressen im Klartext rekonstruierbar, obwohl nie im Klartext gespeichert wurde. Ein mit
 * `BETTER_AUTH_SECRET` verkeyter HMAC macht dasselbe Brute-Force ohne Kenntnis des Secrets
 * praktisch unmöglich, ändert aber nichts an der reinen Zählsemantik (weiterhin deterministisch:
 * derselbe Rohwert ergibt innerhalb eines Prozesses/derselben Konfiguration immer denselben
 * Hash, unterschiedliche Rohwerte kollidieren praktisch nie).
 */

export const RATE_LIMIT_WINDOW_MS = 15 * 60_000;
export const MAX_ATTEMPTS_PER_EMAIL = 5;
export const MAX_ATTEMPTS_PER_IP = 20;

/** Normalisiert eine E-Mail (Groß-/Kleinschreibung, Leerraum) vor dem Hashen, damit „A@x.de" und "a@x.de" dasselbe Subjekt sind. */
export function normalizeEmailSubject(email: string): string {
  return email.trim().toLowerCase();
}

export function hashSubject(value: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(value).digest("hex");
}

export interface RateLimitCheckResult {
  /** true, wenn der Login-Versuch aktuell blockiert werden muss. */
  blocked: boolean;
  /** Sekunden bis zum nächsten sinnvollen Versuch, nur gesetzt wenn blocked. */
  retryAfterSeconds?: number;
}

async function countRecentAttempts(db: AppDatabase, kind: LoginAttemptSubjectKind, subjectHash: string, sinceMs: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempt)
    .where(and(eq(loginAttempt.subjectKind, kind), eq(loginAttempt.subjectHash, subjectHash), gt(loginAttempt.createdAt, new Date(sinceMs))));
  return Number(rows[0]?.count ?? 0);
}

/**
 * Prüft, ob ein Login-Versuch für die gegebene E-Mail und IP aktuell erlaubt ist. Zählt
 * ausschließlich vergangene Versuche (erfolgreich oder nicht) — ruft die aufrufende Stelle
 * IMMER vor der eigentlichen Passwort-Prüfung auf, sonst würde ein Angreifer die Sperre selbst
 * mit auslösen können, aber den Login trotzdem schon versucht haben.
 */
export async function checkLoginRateLimit(db: AppDatabase, params: { email: string; ip: string | null }): Promise<RateLimitCheckResult> {
  const now = Date.now();
  const since = now - RATE_LIMIT_WINDOW_MS;

  const emailHash = hashSubject(normalizeEmailSubject(params.email));
  const emailAttempts = await countRecentAttempts(db, "email", emailHash, since);
  if (emailAttempts >= MAX_ATTEMPTS_PER_EMAIL) {
    return { blocked: true, retryAfterSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
  }

  if (params.ip) {
    const ipHash = hashSubject(params.ip);
    const ipAttempts = await countRecentAttempts(db, "ip", ipHash, since);
    if (ipAttempts >= MAX_ATTEMPTS_PER_IP) {
      return { blocked: true, retryAfterSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
    }
  }

  return { blocked: false };
}

/** Protokolliert einen abgeschlossenen Login-Versuch (E-Mail- und, falls bekannt, IP-Subjekt). */
export async function recordLoginAttempt(db: AppDatabase, params: { email: string; ip: string | null; succeeded: boolean }): Promise<void> {
  const rows: (typeof loginAttempt.$inferInsert)[] = [
    { id: crypto.randomUUID(), subjectKind: "email", subjectHash: hashSubject(normalizeEmailSubject(params.email)), succeeded: params.succeeded },
  ];
  if (params.ip) {
    rows.push({ id: crypto.randomUUID(), subjectKind: "ip", subjectHash: hashSubject(params.ip), succeeded: params.succeeded });
  }
  await db.insert(loginAttempt).values(rows);
}
