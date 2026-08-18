import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as authSchema from "@/server/db/auth-schema";
import type { AppDatabase } from "@/server/db/types";
import { env } from "@/lib/env";
import { getActiveOAuthProviderMap } from "./providers";
import { loginRateLimitPlugin } from "./rate-limit-plugin";
import { REMEMBER_ME_SESSION_SECONDS, SHORT_SESSION_SECONDS } from "./session-durations";

/**
 * Baut die better-auth-Instanz gegen eine gegebene Datenbank. Als Fabrikfunktion statt eines
 * einzigen Modul-Singletons, damit Tests dieselbe Konfiguration gegen eine frische
 * PGlite-Testdatenbank (server/db/test-harness.ts) laufen lassen können, statt zwangsläufig
 * gegen die echte Produktionsverbindung aus server/db/client.ts. `server/auth/index.ts` bindet
 * diese Fabrik einmalig an die echte Verbindung für den Rest der Anwendung.
 *
 * Datenbank-Sessions (kein JWT): `database` ist immer ein Drizzle-Adapter, nie `secondaryStorage`
 * — eine Sitzung steht damit als Zeile in `session` und ist über `session.token` jederzeit
 * serverseitig widerrufbar (z. B. `auth.api.revokeSession`), im Gegensatz zu einem
 * selbsttragenden JWT, das bis zum Ablauf gültig bliebe.
 */

/**
 * Nur EIN Hinweis pro Prozess (nicht pro `createAuth()`-Aufruf, den z. B. jeder Test in
 * `beforeEach` erneut auslöst) — verhindert, dass der Hinweis das Log flutet, obwohl die
 * Aussage („IP-Limit ist deaktiviert") für die gesamte Prozesslaufzeit unverändert gilt.
 */
let hasWarnedAboutDisabledIpRateLimit = false;

/**
 * Befund 1 des Security-Reviews: Ohne bekannte Proxy-Topologie kann better-auth NICHT
 * unterscheiden, ob ein X-Forwarded-For-Header von einem echten vorgeschalteten Reverse-Proxy
 * stammt oder frei vom Angreifer erfunden ist (@better-auth/core/src/utils/ip.ts, Zeilen
 * 329–338: ein einzelner, unverketteter Header-Wert wird ohne `trustedProxies` ungeprüft
 * übernommen). Ein scheinbar aktives, aber tatsächlich wirkungsloses IP-Limit ist gefährlicher
 * als ein ehrlich abgeschaltetes — deshalb hier ein deutlicher, einmaliger Betriebshinweis statt
 * eines stillen Fallbacks.
 */
function warnIfIpRateLimitDisabled(ipRateLimitEnabled: boolean): void {
  if (ipRateLimitEnabled || hasWarnedAboutDisabledIpRateLimit) return;
  hasWarnedAboutDisabledIpRateLimit = true;
  // Bewusster Betriebshinweis, kein Debug-Log; kein Logging-Framework im Projekt vorhanden
  // (siehe Auftrag, „Ausdrücklich nicht Teil dieser Aufgabe").
  console.warn(
    "[auth] IP-basiertes Login-Rate-Limit ist DEAKTIVIERT: TRUSTED_PROXY_IPS ist nicht gesetzt. " +
      "Ohne bekannten, vertrauenswürdigen Reverse-Proxy würde better-auth einem beliebigen, vom " +
      "Client frei wählbaren X-Forwarded-For-Header vertrauen — ein Angreifer könnte das IP-Limit " +
      "damit beliebig oft umgehen. Es gilt deshalb ausschließlich das E-Mail-Limit (5 " +
      "Versuche/15 Minuten). Was tun: Läuft die Anwendung hinter einem bekannten Reverse-Proxy, " +
      "TRUSTED_PROXY_IPS in der Produktionsumgebung setzen (siehe .env.example), um das IP-Limit " +
      "sicher zu aktivieren.",
  );
}

export function createAuth(database: AppDatabase) {
  const activeProviders = getActiveOAuthProviderMap();
  const trustedProxies = env.TRUSTED_PROXY_IPS;
  const ipRateLimitEnabled = trustedProxies.length > 0;
  warnIfIpRateLimitDisabled(ipRateLimitEnabled);

  return betterAuth({
    appName: "Velora Casino Demo",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, { provider: "pg", schema: authSchema }),

    emailAndPassword: {
      enabled: true,
      // Passwort-Hashing: kein eigenes hash()/verify() gesetzt → better-auths Standard (Scrypt
      // via node:crypto, siehe node_modules/better-auth/dist/crypto/password.mjs) greift
      // unverändert. Argon2id wäre nur über eine zusätzliche Abhängigkeit (z. B.
      // @node-rs/argon2) erreichbar, die für diesen Auftrag nicht freigegeben ist (nur
      // `better-auth` selbst durfte installiert werden) — siehe Bericht, „Blocker/Annahmen".

      // Befund 2 des Security-Reviews (Nutzer-Enumeration bei der Registrierung): Ohne dies
      // liefert /sign-up/email bei bereits vergebener E-Mail HTTP 422
      // (USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL) und verrät damit die Existenz eines Kontos,
      // während eine neue E-Mail mit 200 + Sitzung quittiert wird — unterscheidbar allein am
      // Statuscode. `autoSignIn: false` schaltet in der installierten Version (1.6.30,
      // node_modules/better-auth/dist/api/routes/sign-up.mjs,
      // `shouldReturnGenericDuplicateResponse`/`shouldSkipAutoSignIn`) für BEIDE Fälle denselben
      // Antwortpfad frei: Status 200, `token: null`, ein `user`-Objekt (bei bereits
      // existierender E-Mail ein synthetisches, nie persistiertes) — ununterscheidbar von außen.
      //
      // Bewusst NICHT `requireEmailVerification: true` (die vom Auftrag genannte Alternative):
      // dieselbe Bibliotheksstelle verknüpft `requireEmailVerification` und `autoSignIn: false`
      // fest mit derselben internen Weiche (`shouldReturnGenericDuplicateResponse`), sodass
      // `requireEmailVerification` KEINEN zusätzlichen Nutzen brächte, aber zugleich den
      // Passwort-Login für jedes Konto bis zur E-Mail-Bestätigung vollständig sperrt
      // (node_modules/better-auth/dist/api/routes/sign-in.mjs, Zeilen 312–324: `EMAIL_NOT_VERIFIED`
      // wird geworfen, unabhängig davon, ob überhaupt ein Versandweg konfiguriert ist). Da dieses
      // Projekt bewusst KEINEN E-Mail-Versand hat (siehe Auftrag), wäre die Registrierung damit
      // dauerhaft unbenutzbar — kein Nutzer könnte sich je verifizieren. `autoSignIn: false` löst
      // exakt dasselbe Sicherheitsproblem ohne diese Folge.
      //
      // Unvermeidbare Nebenwirkung (gilt für BEIDE Varianten gleichermaßen, nicht nur für die
      // gewählte): Damit beide Antworten wirklich ununterscheidbar sind, darf auch eine
      // GENUINELY neue Registrierung keine Sitzung mehr im selben Request eröffnen — sonst würde
      // schon die bloße Anwesenheit eines Set-Cookie-Headers verraten, welcher Fall vorliegt.
      // Registrierung meldet ab jetzt nicht mehr automatisch an; ein anschließender expliziter
      // Login-Aufruf ist nötig (siehe angepasste Tests in create-auth.test.ts).
      autoSignIn: false,

      // Befund 4 des Security-Reviews (Sitzungen überleben Passwort-Reset): Ohne dies bliebe
      // eine bereits gekaperte Sitzung nach einem Passwort-Wechsel bis zu 30 Tage gültig
      // (REMEMBER_ME_SESSION_SECONDS), obwohl der Nutzer mit dem Reset genau das verhindern
      // wollte. `true` lässt /reset-password nach dem Setzen des neuen Passworts ALLE Sitzungen
      // dieses Kontos serverseitig löschen (node_modules/better-auth/dist/api/routes/password.mjs,
      // Zeile 172: `deleteUserSessions`).
      revokeSessionsOnPasswordReset: true,
    },

    session: {
      // "Angemeldet bleiben" (Standardfall, rememberMe nicht explizit false): 30 Tage,
      // gleitend verlängert alle `updateAge` (Standard: 1 Tag) bei Aktivität.
      expiresIn: REMEMBER_ME_SESSION_SECONDS,
    },

    // Rollen/Status/Gastkennzeichen: server/db/auth-schema.ts führt die Spalten, hier werden
    // sie better-auth bekannt gemacht (ohne diesen Eintrag würde die Bibliothek diese Spalten
    // beim Anlegen/Lesen eines Nutzers schlicht ignorieren). `input: false` verhindert, dass
    // sie über eine öffentliche API (z. B. den Registrierungs-Body) direkt gesetzt werden
    // können — Rollen werden ausschließlich über den Seed-Bootstrap vergeben
    // (server/auth/bootstrap-admin.ts).
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "user", input: false },
        status: { type: "string", required: false, defaultValue: "active", input: false },
        isGuest: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },

    // Konto-Verknüpfung: bewusst auf better-auths Standardverhalten belassen (kein eigener
    // `accountLinking`-Block). Das erfüllt die Sicherheitsanforderung bereits ohne
    // Zusatzcode: `accountLinking.enabled` ist standardmäßig `true`, und
    // `requireLocalEmailVerified` (ebenfalls standardmäßig `true`) verlangt zusätzlich, dass
    // das BESTEHENDE lokale Konto schon verifiziert ist, bevor eine neue, verifizierte
    // Provider-Identität automatisch hineingebunden wird — eine unverifizierte Fremdadresse
    // kann so nie ein bestehendes Konto übernehmen, und dieselbe verifizierte E-Mail über
    // mehrere Provider landet auf einem Konto.
    socialProviders: activeProviders,

    databaseHooks: {
      session: {
        create: {
          /**
           * Setzt die "nicht angemeldet bleiben"-Sitzungsdauer auf exakt 1 Stunde.
           *
           * Warum ein Hook statt einer Bibliotheksoption: better-auth 1.6.30 kennt für
           * `rememberMe: false` nur eine FEST verdrahtete 24-Stunden-Sitzung
           * (node_modules/better-auth/dist/db/internal-adapter.mjs, `createSession`:
           * `expiresAt: dontRememberMe ? getDate(3600 * 24, "sec") : getDate(sessionExpiration,
           * "sec")`) — nicht über eine öffentliche Option konfigurierbar. 24 Stunden statt der
           * geforderten 1 Stunde wäre eine stillschweigende Abweichung von der Vorgabe
           * gewesen; stattdessen wird hier der bereits berechnete Wert für genau den
           * Sign-in-mit-Passwort-Pfad mit `rememberMe: false` korrigiert. Siehe Bericht,
           * Abschnitt „Blocker/Annahmen" für die genaue Einordnung.
           */
          before: async (_session, context) => {
            const isPasswordSignIn = context?.path === "/sign-in/email";
            const rememberMe = context?.body?.rememberMe;
            if (isPasswordSignIn && rememberMe === false) {
              return { data: { expiresAt: new Date(Date.now() + SHORT_SESSION_SECONDS * 1000) } };
            }
            return;
          },
        },
      },
    },

    plugins: [loginRateLimitPlugin(database, { ipRateLimitEnabled })],

    advanced: {
      // Secure + `__Secure-`-Präfix: automatisch aktiv, sobald BETTER_AUTH_URL mit https://
      // beginnt (better-auth leitet `useSecureCookies` sonst aus NODE_ENV=production ab) —
      // siehe node_modules/better-auth/dist/cookies/index.mjs, `createCookieGetter`. HttpOnly
      // und SameSite=Lax sind Bibliotheks-Standard, ebenfalls ohne Zusatzkonfiguration hier.
      //
      // `__Host-`-Präfix: NICHT gesetzt. better-auth verkettet den `__Secure-`/`__Host-`-
      // Präfix-Mechanismus intern untrennbar mit dem `secure`-Attribut (dieselbe
      // `useSecureCookies`-Ableitung); ein eigener `__Host-`-Name über
      // `advanced.cookies.session_token.name` würde zu `__Secure-__Host-...` verdoppelt
      // (ungültiger Cookie-Name), nicht zu einem sauberen `__Host-`-Cookie. Das nur über
      // `useSecureCookies: false` zu umgehen und `secure: true` dann von Hand für JEDEN von
      // better-auth gesetzten Cookie nachzutragen (Sitzung, Cookie-Cache, "dont_remember",
      // OAuth-State) wäre genau das im Auftrag ausgeschlossene "behelfsmäßige Nachbauen" —
      // siehe Bericht, Abschnitt „Blocker/Annahmen".

      // Befund 1 des Security-Reviews (IP-Rate-Limit umgehbar über X-Forwarded-For): NUR
      // gesetzt, wenn env.TRUSTED_PROXY_IPS (lib/env.ts) eine nicht-leere Liste liefert — sonst
      // bleibt dieser Schlüssel bewusst weg (nicht `{ trustedProxies: [] }`), damit better-auths
      // eigene Auflösung (@better-auth/core/src/utils/ip.ts, getIp) unverändert greift; die
      // eigentliche Absicherung passiert NICHT hier, sondern dadurch, dass
      // server/auth/rate-limit-plugin.ts das Ergebnis von `getIp()` ohne konfigurierten Proxy
      // grundsätzlich verwirft (ipRateLimitEnabled), weil schon ein einzelner,
      // unverketteter X-Forwarded-For-Wert ohne `trustedProxies` ungeprüft übernommen würde.
      ipAddress: ipRateLimitEnabled ? { trustedProxies } : undefined,
    },
  });
}

export type VeloraAuth = ReturnType<typeof createAuth>;
