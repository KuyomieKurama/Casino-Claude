import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <div className="pt-8 sm:pt-14">
      <Suspense fallback={<Skeleton className="mx-auto h-[420px] w-full max-w-md rounded-card" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
