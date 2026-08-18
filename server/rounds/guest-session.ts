import { getCookies } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import type { AppDatabase } from "@/server/db/types";
import type { VeloraAuth } from "@/server/auth/create-auth";
import { createGuestAccount } from "@/server/auth/guests";

/**
 * Gastspiel-Verdrahtung „von außen" (Auftrag §6): `server/auth/guests.ts` und
 * `server/auth/create-auth.ts` bleiben unverändert — dieses Modul liegt bewusst außerhalb von
 * `server/auth/**` und verbindet nur die dort bereits vorhandenen, ungenutzten Bausteine mit dem
 * Rundenstart.
 *
 * Warum kein `auth.api.signInAnonymous` o. Ä.: `server/auth/guests.ts` legt das Gastkonto
 * absichtlich direkt über die better-auth-Tabellen an (siehe dortiger Kopfkommentar — das
 * `anonymous`-Plugin würde beim späteren Aufwerten eine NEUE Konto-ID erzeugen). Damit die neue
 * Sitzung von `getSession()` (server/auth/guards.ts, ruft intern `authInstance.api.getSession`
 * auf) erkannt wird, muss das Sitzungscookie exakt so signiert sein, wie better-auth es beim
 * Lesen erwartet: `<token>.<base64(HMAC-SHA256(token, BETTER_AUTH_SECRET))>`, URL-kodiert. Das
 * ist dieselbe Signatur, die better-auth intern für JEDES Sitzungscookie verwendet
 * (node_modules/better-call/dist/crypto.mjs, `signCookieValue`) — hier nachgebaut aus den ZWEI
 * dafür öffentlich exportierten Bausteinen (`better-auth/crypto` für die Signatur,
 * `better-auth/cookies` für Name und Attribute des Cookies), statt better-auths interne
 * Endpoint-Maschinerie (`GenericEndpointContext`) künstlich nachzubauen.
 */

export interface GuestSession {
  userId: string;
  /** Fertiger `Set-Cookie`-Header-Wert für die Rundenstart-Antwort. */
  setCookieHeader: string;
}

function serializeCookie(name: string, value: string, attributes: ReturnType<typeof getCookies>["sessionToken"]["attributes"]): string {
  const parts = [`${name}=${value}`];
  if (typeof attributes.maxAge === "number") parts.push(`Max-Age=${Math.floor(attributes.maxAge)}`);
  if (attributes.domain) parts.push(`Domain=${attributes.domain}`);
  if (attributes.path) parts.push(`Path=${attributes.path}`);
  if (attributes.expires) parts.push(`Expires=${attributes.expires.toUTCString()}`);
  if (attributes.httpOnly) parts.push("HttpOnly");
  if (attributes.secure) parts.push("Secure");
  if (attributes.sameSite) parts.push(`SameSite=${attributes.sameSite.charAt(0).toUpperCase()}${attributes.sameSite.slice(1)}`);
  return parts.join("; ");
}

/** Legt ein Gastkonto an und liefert ein Sitzungscookie, das `getSession()` beim nächsten Request erkennt. */
export async function startGuestSession(db: AppDatabase, auth: VeloraAuth): Promise<GuestSession> {
  const guest = await createGuestAccount(db);
  const cookies = getCookies(auth.options);
  const signature = await makeSignature(guest.sessionToken, auth.options.secret);
  const signedValue = encodeURIComponent(`${guest.sessionToken}.${signature}`);
  return {
    userId: guest.userId,
    setCookieHeader: serializeCookie(cookies.sessionToken.name, signedValue, cookies.sessionToken.attributes),
  };
}
