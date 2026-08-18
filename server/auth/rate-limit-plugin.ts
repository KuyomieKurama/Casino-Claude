import "server-only";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getIp, isAPIError } from "better-auth/api";
import type { AppDatabase } from "@/server/db/types";
import { checkLoginRateLimit, recordLoginAttempt } from "./rate-limit";

/**
 * better-auth-Plugin, das den Passwort-Login (`/sign-in/email`) um die gestaffelte
 * Rate-Begrenzung aus server/auth/rate-limit.ts ergänzt.
 *
 * Warum ein Plugin mit `matcher` statt der globalen `hooks.before`/`hooks.after`-Option:
 * Plugin-Hooks laufen durch dieselbe Pipeline (server/api/dispatch.ts der Bibliothek), erlauben
 * aber einen `matcher`, der nur für den Sign-in-Pfad zuschlägt — die globalen Hooks würden für
 * JEDEN Request feuern und müssten den Pfad selbst herausfiltern.
 *
 * Ablauf:
 *  - `before`: zählt bisherige Versuche für E-Mail und IP-Hash; bei Überschreiten wird der
 *    Request mit 429 abgebrochen, BEVOR better-auth das Passwort prüft (sonst würde ein
 *    Angreifer die Sperre erst auslösen, nachdem der eigentliche Versuch schon durch ist).
 *  - `after`: liest das tatsächliche Ergebnis (Erfolg oder better-auths eigener
 *    `INVALID_EMAIL_OR_PASSWORD`-Fehler) und protokolliert genau einen Versuch je Subjekt.
 */
export interface LoginRateLimitPluginOptions {
  /**
   * Nur `true`, wenn server/auth/create-auth.ts anhand von `env.TRUSTED_PROXY_IPS` einen
   * bekannten, vertrauenswürdigen Reverse-Proxy konfiguriert hat (Befund 1 des Security-Reviews:
   * `advanced.ipAddress.trustedProxies` NICHT gesetzt lässt better-auth einem beliebigen,
   * vom Client frei wählbaren X-Forwarded-For-Header vertrauen — bereits ein einzelner,
   * unverketteter Header-Wert wird ohne Prüfung als Client-IP übernommen,
   * @better-auth/core/src/utils/ip.ts, Zeilen 329–338). Ist dieser Schalter `false`, wird die
   * IP absichtlich NIE aufgelöst — nicht einmal, wenn `getIp()` selbst (ohne unser Zutun) einen
   * Wert zurückliefern würde —, damit ausschließlich das E-Mail-Limit gilt, das unabhängig von
   * jedem Header ist und sich nicht durch Header-Rotation umgehen lässt.
   */
  ipRateLimitEnabled: boolean;
}

export function loginRateLimitPlugin(db: AppDatabase, options: LoginRateLimitPluginOptions): BetterAuthPlugin {
  const isSignInEmailPath = (path: string | undefined): boolean => path === "/sign-in/email";

  /** Löst die Client-IP nur auf, wenn ein vertrauenswürdiger Proxy konfiguriert ist (siehe oben). */
  function resolveTrustedIp(ctx: { request?: Request; headers?: Headers; context: { options: Parameters<typeof getIp>[1] } }): string | null {
    if (!options.ipRateLimitEnabled) return null;
    return getIp(ctx.request ?? ctx.headers ?? new Headers(), ctx.context.options);
  }

  return {
    id: "velora-login-rate-limit",
    hooks: {
      before: [
        {
          matcher: (ctx) => isSignInEmailPath(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const email = typeof ctx.body?.email === "string" ? ctx.body.email : null;
            if (!email) return;
            const ip = resolveTrustedIp(ctx);
            const result = await checkLoginRateLimit(db, { email, ip });
            if (result.blocked) {
              throw new APIError("TOO_MANY_REQUESTS", {
                message: "Zu viele Anmeldeversuche. Was tun: Kurz warten (bis zu 15 Minuten) und dann erneut versuchen.",
              });
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => isSignInEmailPath(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const email = typeof ctx.body?.email === "string" ? ctx.body.email : null;
            if (!email) return;
            const ip = resolveTrustedIp(ctx);
            const returned = ctx.context.returned;
            const succeeded = returned !== undefined && !isAPIError(returned);
            await recordLoginAttempt(db, { email, ip, succeeded });
          }),
        },
      ],
    },
  };
}
