export type UserRole = "user" | "admin";

/**
 * Client-seitige Sicht auf die Serversitzung — bewusst ein eigener, schlanker Typ statt eines
 * Imports aus server/auth/guards.ts: state/** und components/** dürfen laut Schichtregel
 * (ESLint) nichts aus @/server/* importieren. app/layout.tsx (Server Component) bildet die
 * echte Sitzung (server/auth/guards.ts, AuthenticatedUser) auf genau diese Form ab, bevor sie
 * als Prop in den Client-Baum wandert.
 */
export type User = {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  isGuest: boolean;
  // Kein Passwortfeld, in keiner Form (Regel 5).
};
