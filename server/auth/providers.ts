import "server-only";
import { env } from "@/lib/env";

/**
 * OAuth-Provider-Registry: provider-agnostisch, damit ein weiterer Provider sich später
 * ausschließlich über neue Umgebungsvariablen ergänzen lässt, ohne Codeänderungen an den
 * Aufrufstellen (server/auth/index.ts, spätere UI). Ein Provider ist genau dann aktiv, wenn
 * seine Client-ID UND sein Client-Secret gesetzt sind — lib/env.ts erzwingt bereits, dass beide
 * nur zusammen gesetzt sein dürfen, hier wird nur noch geprüft, ob überhaupt beide vorhanden sind.
 */

export type OAuthProviderKey = "google" | "github" | "discord";

export interface OAuthProviderDefinition {
  key: OAuthProviderKey;
  /** Anzeigename für eine spätere UI (Anmeldeknopf-Beschriftung). */
  displayName: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
}

/** Anzeigename je Provider, unabhängig von der env-Konfiguration. */
const PROVIDER_DEFINITIONS: readonly OAuthProviderDefinition[] = [
  { key: "google", displayName: "Google", clientId: env.OAUTH_GOOGLE_CLIENT_ID, clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET },
  { key: "github", displayName: "GitHub", clientId: env.OAUTH_GITHUB_CLIENT_ID, clientSecret: env.OAUTH_GITHUB_CLIENT_SECRET },
  { key: "discord", displayName: "Discord", clientId: env.OAUTH_DISCORD_CLIENT_ID, clientSecret: env.OAUTH_DISCORD_CLIENT_SECRET },
];

export interface ActiveOAuthProvider {
  key: OAuthProviderKey;
  displayName: string;
  clientId: string;
  clientSecret: string;
}

function isActive(definition: OAuthProviderDefinition): definition is OAuthProviderDefinition & { clientId: string; clientSecret: string } {
  return typeof definition.clientId === "string" && definition.clientId.length > 0 && typeof definition.clientSecret === "string" && definition.clientSecret.length > 0;
}

/**
 * Liefert nur die vollständig konfigurierten (also nutzbaren) Provider — eine spätere UI zeigt
 * damit nie einen Anmeldeknopf, der beim Klick an fehlenden Zugangsdaten scheitert.
 */
export function getActiveOAuthProviders(): ActiveOAuthProvider[] {
  return PROVIDER_DEFINITIONS.filter(isActive).map(({ key, displayName, clientId, clientSecret }) => ({ key, displayName, clientId, clientSecret }));
}

/** Für server/auth/index.ts: baut die `socialProviders`-Option aus den aktiven Providern. */
export function getActiveOAuthProviderMap(): Partial<Record<OAuthProviderKey, { clientId: string; clientSecret: string }>> {
  const map: Partial<Record<OAuthProviderKey, { clientId: string; clientSecret: string }>> = {};
  for (const provider of getActiveOAuthProviders()) {
    map[provider.key] = { clientId: provider.clientId, clientSecret: provider.clientSecret };
  }
  return map;
}
