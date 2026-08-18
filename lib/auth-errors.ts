/**
 * Bildet Fehlerantworten des better-auth-Clients (components/auth/authClient.ts) auf
 * deutsche, nutzerverständliche Meldungen ab — Muster "Was ist passiert → Was jetzt tun".
 *
 * Bewusst eigene Texte statt der bibliothekseigenen Meldungen
 * (@better-auth/core/dist/error/codes.mjs, z. B. "Invalid email or password"): Diese sind
 * Englisch und für den Login-Fall zusätzlich absichtlich zu wenig spezifisch abzubilden, ohne
 * eigene Zuordnung — unbekanntes Konto und falsches Passwort dürfen sich in der Oberfläche
 * nicht unterscheiden (server/auth/create-auth.test.ts, "Keine Nutzer-Enumeration"; die
 * Bibliothek liefert dafür bereits denselben Statuscode/Code für beide Fälle, hier wird daraus
 * nur eine verständliche, einheitliche deutsche Meldung).
 */

export interface AuthClientError {
  status: number;
  message?: string;
}

export const GENERIC_LOGIN_ERROR = "E-Mail oder Passwort sind falsch. Was tun: Bitte prüfe beide Angaben und versuche es erneut.";
export const RATE_LIMIT_FALLBACK_ERROR = "Zu viele Anmeldeversuche. Was tun: Kurz warten (bis zu 15 Minuten) und dann erneut versuchen.";
export const GENERIC_LOGIN_UNAVAILABLE_ERROR = "Anmeldung derzeit nicht möglich. Was tun: Bitte in Kürze erneut versuchen.";
export const GENERIC_REGISTER_UNAVAILABLE_ERROR = "Registrierung derzeit nicht möglich. Was tun: Bitte in Kürze erneut versuchen.";

/** true, wenn eine vom Server mitgelieferte Meldung angezeigt werden darf (nicht leer). */
function hasUsableMessage(error: AuthClientError): error is AuthClientError & { message: string } {
  return typeof error.message === "string" && error.message.trim().length > 0;
}

/**
 * Fehlermeldung für den Passwort-Login. 401 (falsches Passwort ODER unbekanntes Konto) liefert
 * IMMER dieselbe generische Meldung — nie den Feldnamen oder eine Andeutung, welcher der beiden
 * Fälle vorliegt. 429 (Rate-Limit, server/auth/rate-limit-plugin.ts) zeigt die vom Server
 * mitgelieferte, bereits deutsche "Was tun"-Meldung, mit Fallback falls sie fehlen sollte.
 */
export function loginErrorMessage(error: AuthClientError): string {
  if (error.status === 401) return GENERIC_LOGIN_ERROR;
  if (error.status === 429) return hasUsableMessage(error) ? error.message : RATE_LIMIT_FALLBACK_ERROR;
  return GENERIC_LOGIN_UNAVAILABLE_ERROR;
}

/** Fehlermeldung für die Registrierung. Duplicate-E-Mail liefert bewusst KEINEN Fehler (autoSignIn: false, Befund 2) — hier bleiben nur echte Ausnahmefälle (Rate-Limit, Serverfehler). */
export function registerErrorMessage(error: AuthClientError): string {
  if (error.status === 429) return hasUsableMessage(error) ? error.message : RATE_LIMIT_FALLBACK_ERROR;
  return GENERIC_REGISTER_UNAVAILABLE_ERROR;
}
