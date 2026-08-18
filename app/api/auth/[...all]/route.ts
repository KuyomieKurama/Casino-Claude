import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

/**
 * Catch-all-Route für sämtliche better-auth-Endpunkte (`/api/auth/sign-in/email`,
 * `/api/auth/callback/google`, `/api/auth/get-session`, …). `toNextJsHandler` verdrahtet nur
 * GET/POST/PATCH/PUT/DELETE gegen `auth.handler` — die eigentliche Routing- und
 * Sicherheitslogik (CSRF-Prüfung, Rate Limiting, Sitzungsverwaltung) lebt vollständig in
 * server/auth/create-auth.ts, nicht hier.
 *
 * `runtime = "nodejs"` ist zwingend: Passwort-Hashing (Scrypt über node:crypto,
 * node_modules/better-auth/dist/crypto/password.mjs) und der `pg`-Treiber sind nicht
 * Edge-fähig — ohne dieses Flag würde Next.js versuchen, die Route auf der Edge-Runtime
 * auszuliefern, wo beides fehlschlägt.
 */
export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
