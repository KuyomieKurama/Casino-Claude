/**
 * Sitzungsdauern, aus server/auth/create-auth.ts ausgelagert: eigenständige Datei ohne
 * Abhängigkeit von lib/env.ts, damit server/auth/guests.ts (Sitzungsdauer für neu angelegte
 * Gastkonten) diese Werte nutzen kann, ohne beim Import zwangsläufig die volle
 * Umgebungsvalidierung (DATABASE_URL, BETTER_AUTH_SECRET, …) auszulösen, die create-auth.ts
 * durch seinen `lib/env`-Import mitbringt.
 *
 * 1 Stunde entspricht `SESSION_TTL_MS` aus `state/session-reducer.ts` (heutiges clientseitiges
 * Pendant ohne "angemeldet bleiben"). Kein Import von dort: die ESLint-Schichtregel verbietet
 * `server/**` den Import aus `state/**` (server/ kennt keinen Browser-Zustand). Der Wert ist
 * deshalb hier als eigene, klar benannte Konstante dupliziert statt importiert.
 */
export const SHORT_SESSION_SECONDS = 60 * 60;
export const REMEMBER_ME_SESSION_SECONDS = 60 * 60 * 24 * 30;
