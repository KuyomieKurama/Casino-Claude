"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { useSession } from "@/state/SessionContext";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DEMO_ACCOUNT_HINT, PASSWORD_HINT } from "@/lib/constants";
import { firstErrorField, validateLogin, type FieldErrors, type LoginFields } from "@/lib/validation";

/** Ziel nach dem Login: nur relative Pfade, keine externen Weiterleitungen. */
export function safeNext(next: string | null, fallback = "/profile"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export function LoginForm() {
  const { login, hydrated } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<LoginFields>>({});
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Das Passwort wird direkt aus dem Feld gelesen, validiert und danach verworfen (Regel 5).
    // Es liegt zu keinem Zeitpunkt im React-State, im Context oder im Storage.
    const password = passwordRef.current?.value ?? "";
    const next = validateLogin({ email, password });
    setErrors(next);
    const first = firstErrorField(["email", "password"], next);
    if (first) {
      (first === "email" ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    login({ email, rememberMe });
    if (passwordRef.current) passwordRef.current.value = "";
    toast({ tone: "success", title: "Angemeldet (Demo-Konto).", description: "Es wurden keine Echtgeld- oder Identitätsdaten übertragen." });
    router.replace(safeNext(params.get("next")));
  };

  return (
    <Card as="section" signature aria-labelledby="login-title" className="mx-auto w-full max-w-md space-y-5">
      <div>
        <h1 id="login-title" className="font-display text-2xl text-primary">
          Anmelden
        </h1>
        <p className="mt-1 text-sm text-muted">{DEMO_ACCOUNT_HINT}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input
          ref={emailRef}
          label="E-Mail"
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />
        <Input
          ref={passwordRef}
          label="Passwort"
          type="password"
          name="password"
          autoComplete="current-password"
          hint={PASSWORD_HINT}
          error={errors.password}
          required
        />
        <Checkbox label="Eingeloggt bleiben" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} hint="Ohne Haken endet die Demo-Sitzung nach einer Stunde." />
        <Button type="submit" variant="primary" fullWidth loading={submitting} disabled={!hydrated} iconLeft={<LogIn className="size-4" aria-hidden="true" />}>
          Anmelden
        </Button>
      </form>
      <p className="text-sm text-muted">
        Noch kein Demo-Konto?{" "}
        <Link href={`/register${params.get("next") ? `?next=${encodeURIComponent(params.get("next") ?? "")}` : ""}`} className="font-medium text-gold hover:text-gold-strong">
          Jetzt anlegen
        </Link>
      </p>
    </Card>
  );
}
