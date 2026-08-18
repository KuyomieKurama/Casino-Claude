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

const BETTER_AUTH_SECRET_MESSAGE =
  "BETTER_AUTH_SECRET fehlt oder ist zu kurz. Was tun: Einen zufälligen Wert mit mindestens 32 " +
  "Zeichen setzen, z. B. per `openssl rand -base64 32` (siehe .env.example).";

const BETTER_AUTH_URL_MESSAGE =
  "BETTER_AUTH_URL fehlt oder ist keine gültige URL. Was tun: Die öffentlich erreichbare " +
  "Basis-URL der Anwendung setzen, z. B. http://localhost:3000 lokal oder " +
  "https://velora.example.com in Produktion (siehe .env.example).";

const BETTER_AUTH_URL_HTTPS_MESSAGE =
  "BETTER_AUTH_URL muss in Produktion (NODE_ENV=production) mit https:// beginnen. Was tun: " +
  "Eine erreichbare https://-URL setzen. Grund: better-auth leitet aus dem Protokoll dieser URL " +
  "ab, ob Sitzungscookies mit dem Secure-Attribut (und __Secure-Präfix) ausgeliefert werden " +
  "(node_modules/better-auth/dist/cookies/index.mjs, createCookieGetter). Eine http://-URL in " +
  "Produktion würde diese Absicherung still deaktivieren, ohne dass das an anderer Stelle auffällt.";

const TRUSTED_PROXY_IPS_MESSAGE =
  "TRUSTED_PROXY_IPS enthält einen ungültigen Eintrag. Was tun: nur IP-Adressen oder " +
  "CIDR-Bereiche (z. B. 10.0.0.0/8 oder 2001:db8::/32), durch Komma getrennt, angeben. Ein " +
  "falsch gesetzter Wert ist gefährlicher als ein fehlender: ein zu weit gefasster oder falscher " +
  "Bereich lässt Angreifer die IP-Rate-Begrenzung erneut über einen gefälschten " +
  "X-Forwarded-For-Header umgehen (siehe server/auth/rate-limit-plugin.ts).";

/**
 * Prüft einen einzelnen TRUSTED_PROXY_IPS-Eintrag auf Gültigkeit (IPv4/IPv6, optional mit
 * CIDR-Präfix). Bewusst dieselbe Semantik wie better-auths eigene CIDR-Prüfung
 * (@better-auth/core/src/utils/ip.ts, parseCIDR) — der validierte Wert wird 1:1 an
 * `advanced.ipAddress.trustedProxies` durchgereicht (server/auth/create-auth.ts), ein
 * Abweichen der Prüfregeln hier würde nur einen scheinbar gültigen, dort aber ignorierten
 * Eintrag erzeugen.
 */
function isValidTrustedProxyEntry(entry: string): boolean {
  const slashIndex = entry.lastIndexOf("/");
  const address = slashIndex === -1 ? entry : entry.slice(0, slashIndex);
  const isV4 = z.ipv4().safeParse(address).success;
  const isV6 = !isV4 && z.ipv6().safeParse(address).success;
  if (!isV4 && !isV6) return false;
  if (slashIndex === -1) return true;
  const prefixPart = entry.slice(slashIndex + 1);
  if (!/^\d+$/.test(prefixPart)) return false;
  const prefix = Number(prefixPart);
  return prefix <= (isV4 ? 32 : 128);
}

/**
 * Namen aller optionalen Umgebungsvariablen. Zentral an einer Stelle gepflegt und in
 * normalizeOptionalEnv() unten wiederverwendet, statt die Normalisierung an jedem einzelnen
 * Feld zu wiederholen. Pflichtvariablen (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL)
 * stehen hier bewusst NICHT: Ein leerer Wert bleibt dort ein Konfigurationsfehler mit eigener,
 * die Variable benennenden Meldung — siehe normalizeOptionalEnv() für die Begründung.
 */
const OPTIONAL_ENV_KEYS = [
  "SESSION_SECRET",
  "ADMIN_BOOTSTRAP_EMAIL",
  "OAUTH_GOOGLE_CLIENT_ID",
  "OAUTH_GOOGLE_CLIENT_SECRET",
  "OAUTH_GITHUB_CLIENT_ID",
  "OAUTH_GITHUB_CLIENT_SECRET",
  "OAUTH_DISCORD_CLIENT_ID",
  "OAUTH_DISCORD_CLIENT_SECRET",
  "TRUSTED_PROXY_IPS",
] as const;

/**
 * Behandelt leere oder ausschließlich aus Leerzeichen bestehende Werte optionaler Variablen wie
 * „nicht gesetzt" (entfernt den Schlüssel aus einer Kopie von process.env), bevor das Schema
 * validiert.
 *
 * Warum nötig: zods `.optional()` greift nur, wenn ein Schlüssel fehlt oder `undefined` ist —
 * nicht bei einem gesetzten, aber leeren String. Wer `.env.example` kopiert und eine optionale
 * Zeile wie `OAUTH_GOOGLE_CLIENT_ID=` unverändert leer lässt (statt sie zu entfernen oder
 * auszukommentieren), hat einen gesetzten Leerstring im Prozess — der scheiterte bisher an
 * `.min(1)`, obwohl die Variable als „nicht gesetzt" gemeint war. Genau das brach beim ersten
 * `npm run build` auf einem Produktionsserver mit sechs OAuth-Fehlern ab.
 *
 * Warum zentral statt pro Feld: Eine einzige Liste (OPTIONAL_ENV_KEYS) plus eine Funktion, statt
 * `.transform()`/`.preprocess()` an jedem der neun betroffenen Felder zu wiederholen. Betrifft
 * ausschließlich die dort gelisteten Variablen — Pflichtvariablen durchlaufen diese Funktion
 * nicht und bleiben bei leerem Wert ein klarer, benannter Fehler.
 */
function normalizeOptionalEnv(rawEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const normalized = { ...rawEnv };
  for (const key of OPTIONAL_ENV_KEYS) {
    const value = normalized[key];
    if (typeof value === "string" && value.trim() === "") {
      delete normalized[key];
    }
  }
  return normalized;
}

const rawEnvSchema = z.object({
  DATABASE_URL: z
    .string(DATABASE_URL_MISSING_MESSAGE)
    .min(1, DATABASE_URL_MISSING_MESSAGE)
    .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), DATABASE_URL_PROTOCOL_MESSAGE),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Phase-0-Überbleibsel, unbenutzt: Der ursprüngliche Plan war, dieses Feld in Phase 1 zur
  // Pflicht zu machen, es wurde jedoch durch das unten stehende, klarer benannte
  // BETTER_AUTH_SECRET ersetzt. Bleibt optional bestehen (statt entfernt), damit bereits
  // laufende .env-Dateien mit gesetztem SESSION_SECRET nicht plötzlich einen ungenutzten Fehler
  // werfen.
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET darf, wenn gesetzt, nicht leer sein.").optional(),
  BETTER_AUTH_SECRET: z.string(BETTER_AUTH_SECRET_MESSAGE).min(32, BETTER_AUTH_SECRET_MESSAGE),
  BETTER_AUTH_URL: z.url(BETTER_AUTH_URL_MESSAGE),
  ADMIN_BOOTSTRAP_EMAIL: z.email("ADMIN_BOOTSTRAP_EMAIL muss, wenn gesetzt, eine gültige E-Mail-Adresse sein.").optional(),
  // OAuth-Zugangsdaten je Provider: beide optional, aber siehe .refine() unten — ID und Secret
  // gehören zusammen. Registrierung der freigeschalteten Provider: server/auth/providers.ts.
  OAUTH_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_GITHUB_CLIENT_ID: z.string().min(1).optional(),
  OAUTH_GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_DISCORD_CLIENT_ID: z.string().min(1).optional(),
  OAUTH_DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  // Optional, standardmäßig leer: Ohne diese Liste vertraut server/auth/create-auth.ts KEINER
  // X-Forwarded-For-Angabe und deaktiviert das IP-basierte Login-Rate-Limit vollständig (nur
  // das E-Mail-Limit bleibt aktiv) — siehe server/auth/rate-limit-plugin.ts. Grund: Ohne
  // bekannte Proxy-Topologie kann better-auth nicht unterscheiden, ob ein X-Forwarded-For-Wert
  // von einem echten vorgeschalteten Reverse-Proxy stammt oder frei vom Angreifer erfunden ist.
  TRUSTED_PROXY_IPS: z
    .string()
    .optional()
    .transform((raw) =>
      (raw ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .refine((entries) => entries.every(isValidTrustedProxyEntry), TRUSTED_PROXY_IPS_MESSAGE),
});

/**
 * Erzwingt „ID und Secret gehören zusammen" je Provider: Ist nur eines von beiden gesetzt, ist
 * das ein Konfigurationsfehler und der Start bricht ab — sonst erscheint später ein
 * Anmeldeknopf (server/auth/providers.ts zeigt nur „vollständig konfigurierte" Provider an),
 * der beim Klick mit einem kryptischen OAuth-Fehler scheitert, statt beim Start sichtbar zu
 * werden.
 */
function refinePairedOAuthCredentials(schema: typeof rawEnvSchema) {
  const pairs = [
    ["OAUTH_GOOGLE_CLIENT_ID", "OAUTH_GOOGLE_CLIENT_SECRET", "Google"],
    ["OAUTH_GITHUB_CLIENT_ID", "OAUTH_GITHUB_CLIENT_SECRET", "GitHub"],
    ["OAUTH_DISCORD_CLIENT_ID", "OAUTH_DISCORD_CLIENT_SECRET", "Discord"],
  ] as const;
  return schema.superRefine((value, ctx) => {
    for (const [idKey, secretKey, label] of pairs) {
      const hasId = typeof value[idKey] === "string" && value[idKey].length > 0;
      const hasSecret = typeof value[secretKey] === "string" && value[secretKey].length > 0;
      if (hasId === hasSecret) continue;
      const missingKey = hasId ? secretKey : idKey;
      ctx.addIssue({
        code: "custom",
        path: [missingKey],
        message:
          `${label}: ${idKey} und ${secretKey} müssen zusammen gesetzt sein (oder beide leer ` +
          `bleiben, damit der Provider inaktiv ist). Was tun: ${missingKey} ergänzen oder ` +
          `${hasId ? idKey : secretKey} wieder entfernen.`,
      });
    }
  });
}

/**
 * Erzwingt https:// für BETTER_AUTH_URL in Produktion. Nur dort relevant: lokal (development)
 * und in Tests bleibt http://localhost weiterhin erlaubt, damit keine lokale
 * TLS-Terminierung nötig ist.
 */
function refineProductionHttps<Schema extends z.ZodType<z.infer<typeof rawEnvSchema>>>(schema: Schema) {
  return schema.superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.BETTER_AUTH_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["BETTER_AUTH_URL"], message: BETTER_AUTH_URL_HTTPS_MESSAGE });
    }
  });
}

const envSchema = refineProductionHttps(refinePairedOAuthCredentials(rawEnvSchema));

export type Env = z.infer<typeof envSchema>;

/** Baut aus den Zod-Fehlern eine Meldung, die die betroffene Variable klar benennt. */
function formatValidationError(error: z.ZodError): string {
  const details = error.issues.map((issue) => `- ${issue.path.join(".") || "(unbekannte Variable)"}: ${issue.message}`).join("\n");
  return `Ungültige Umgebungskonfiguration.\n${details}`;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(normalizeOptionalEnv(process.env));
  if (!parsed.success) {
    throw new Error(formatValidationError(parsed.error));
  }
  return parsed.data;
}

export const env: Env = loadEnv();
