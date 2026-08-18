import { createAuthClient } from "better-auth/react";

/**
 * Client-seitige better-auth-Instanz für Formular-Mutationen (Anmelden, Registrieren, Abmelden,
 * OAuth-Start). Ohne baseURL/basePath: better-auth leitet beides aus dem aktuellen Origin ab
 * und spricht relativ `/api/auth/*` an — dieselbe Route (app/api/auth/[...all]/route.ts), gegen
 * die auch server/auth/create-auth.test.ts testet (dort direkt über `auth.handler(...)`).
 *
 * Warum ein Fetch-Client statt Server Actions: better-auth übernimmt für diesen Client bereits
 * vollständig, wie eine Mutation Cookies setzt (Set-Cookie auf der Route-Handler-Antwort,
 * inklusive CSRF-Schutz für den OAuth-State) — eine Server Action müsste dieselbe Logik über
 * next/headers()/next/cookies() von Hand nachbauen, für jede einzelne Mutation erneut. Lesende
 * Zugriffe (Zugriffsprüfung, Sitzungsanzeige in Server Components) laufen bewusst NICHT über
 * diesen Client, sondern weiterhin über server/auth/guards.ts — dort ist ein echter
 * Datenbankzugriff im selben Prozess möglich, hier nur ein HTTP-Roundtrip.
 */
export const authClient = createAuthClient();
