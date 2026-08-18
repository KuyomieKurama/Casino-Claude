import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { Skeleton } from "@/components/ui/Skeleton";
import { getActiveOAuthProviders } from "@/server/auth/providers";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  // Nur Schlüssel + Anzeigename gehen an den Client — clientId/clientSecret bleiben serverseitig
  // (server/auth/providers.ts liefert sie zusätzlich, werden hier bewusst nicht weitergegeben).
  const providers = getActiveOAuthProviders().map(({ key, displayName }) => ({ key, displayName }));
  return (
    <div className="pt-8 sm:pt-14">
      <Suspense fallback={<Skeleton className="mx-auto h-[420px] w-full max-w-md rounded-card" />}>
        <LoginForm providers={providers} />
      </Suspense>
    </div>
  );
}
