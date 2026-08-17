import "server-only";
import { z } from "zod";

/**
 * Zentrale, beim Start validierte Laufzeitkonfiguration (Phase 0: nur die Datenbank).
 *
 * Warum fail-fast: Eine fehlende oder falsche DATABASE_URL soll den Prozess beim Start sichtbar
 * beenden, nicht erst bei der ersten Datenbankabfrage mit einem kryptischen Verbindungsfehler
 * auffallen. Deshalb wird hier bei ungültiger Konfiguration eine Exception geworfen statt ein
 * Feld leer oder mit einem Platzhalter zu belegen — es gibt keine stillen Defaults für
 * Verbindungsdaten.
 *
 * Warum ausschließlich hier: `process.env` wird per ESLint-Regel außerhalb dieser Datei
 * verboten (Ausnahmen: Root-Werkzeugkonfigurationen wie next.config.ts/drizzle.config.ts und
 * das eigenständige Seed-Skript, siehe dortige Kommentare). So gibt es genau eine Stelle, die
 * geprüft werden muss, damit kein Geheimnis versehentlich ungeprüft verwendet wird.
 *
 * Warum `import "server-only"`: Diese Datei liest Verbindungsdaten und wird in einer späteren
 * Phase aus Server Components/Route Handlern importiert. `NEXT_PUBLIC_*`-Variablen kommen hier
 * bewusst nicht vor — nichts aus dieser Datei darf ins Client-Bundle gelangen.
 */

const DATABASE_URL_MISSING_MESSAGE =
  "DATABASE_URL fehlt. Was tun: In .env eine PostgreSQL-Verbindung setzen, z. B. " +
  "postgresql://user:passwort@localhost:5432/velora (siehe .env.example).";

const DATABASE_URL_PROTOCOL_MESSAGE =
  "DATABASE_URL hat ein ungültiges Protokoll. Was tun: Die Verbindung muss mit postgres:// " +
  "oder postgresql:// beginnen.";

const envSchema = z.object({
  DATABASE_URL: z
    .string(DATABASE_URL_MISSING_MESSAGE)
    .min(1, DATABASE_URL_MISSING_MESSAGE)
    .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), DATABASE_URL_PROTOCOL_MESSAGE),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Pflicht erst ab Phase 1 (better-auth signiert Sitzungen damit). Hier optional, damit
  // Phase 0 ohne Auth-Setup lauffähig bleibt — sobald Auth eingeführt wird, verliert dieses
  // Feld sein `.optional()`.
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET darf, wenn gesetzt, nicht leer sein.").optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.email("ADMIN_BOOTSTRAP_EMAIL muss, wenn gesetzt, eine gültige E-Mail-Adresse sein.").optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Baut aus den Zod-Fehlern eine Meldung, die die betroffene Variable klar benennt. */
function formatValidationError(error: z.ZodError): string {
  const details = error.issues.map((issue) => `- ${issue.path.join(".") || "(unbekannte Variable)"}: ${issue.message}`).join("\n");
  return `Ungültige Umgebungskonfiguration.\n${details}`;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatValidationError(parsed.error));
  }
  return parsed.data;
}

export const env: Env = loadEnv();
