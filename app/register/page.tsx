import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Demo-Konto anlegen" };

export default function RegisterPage() {
  return (
    <div className="pt-8 sm:pt-14">
      <Suspense fallback={<Skeleton className="mx-auto h-[560px] w-full max-w-md rounded-card" />}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
