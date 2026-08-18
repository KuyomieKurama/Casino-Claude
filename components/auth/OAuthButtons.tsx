"use client";

import { Github } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/Button";
import { authClient } from "./authClient";

/**
 * Client-sichere Provider-Beschreibung: nur Schlüssel + Anzeigename, NIE clientId/clientSecret
 * (server/auth/providers.ts liefert diese zusätzlich, app/login/page.tsx und
 * app/register/page.tsx geben absichtlich nur dieses schlanke Objekt weiter).
 */
export interface OAuthProviderOption {
  key: "google" | "github" | "discord";
  displayName: string;
}

// Nur dort ein Icon, wo lucide-react einen passenden, nicht-markenrechtlich geschützten
// Namenstreffer bietet (Auftrag §3: keine fremden Markenlogos, keine neue Abhängigkeit).
// Google/Discord bekommen bewusst nur Text — ein Browser- oder Gamepad-Icon wäre irreführend.
const PROVIDER_ICONS: Partial<Record<OAuthProviderOption["key"], ComponentType<{ className?: string; "aria-hidden"?: boolean }>>> = {
  github: Github,
};

export interface OAuthButtonsProps {
  providers: readonly OAuthProviderOption[];
  /** Relatives Ziel nach erfolgreicher OAuth-Anmeldung (bereits über lib/safe-redirect geprüft). */
  callbackURL: string;
}

/**
 * Zeigt genau einen Knopf je AKTIV konfiguriertem Provider (Auftrag §3). Ist die Liste leer,
 * rendert die Komponente nichts — kein leerer Rahmen, keine tote Fläche.
 */
export function OAuthButtons({ providers, callbackURL }: OAuthButtonsProps) {
  if (providers.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted" role="separator" aria-orientation="horizontal">
        <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
        oder
        <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-2">
        {providers.map((provider) => {
          const Icon = PROVIDER_ICONS[provider.key];
          return (
            <Button
              key={provider.key}
              type="button"
              variant="outline"
              fullWidth
              className="focus-glow"
              iconLeft={Icon ? <Icon className="size-4" aria-hidden={true} /> : undefined}
              onClick={() => authClient.signIn.social({ provider: provider.key, callbackURL })}
            >
              Mit {provider.displayName} anmelden
            </Button>
          );
        })}
      </div>
    </div>
  );
}
