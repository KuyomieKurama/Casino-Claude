import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Skeleton } from "@/components/ui/Skeleton";
import { getActiveOAuthProviders } from "@/server/auth/providers";

export const metadata: Metadata = { title: "Konto anlegen" };

export default function RegisterPage() {
  const providers = getActiveOAuthProviders().map(({ key, displayName }) => ({ key, displayName }));
  return (
    <div className="pt-8 sm:pt-14">
      <Suspense fallback={<Skeleton className="mx-auto h-[560px] w-full max-w-md rounded-card" />}>
        <RegisterForm providers={providers} />
      </Suspense>
    </div>
  );
}
