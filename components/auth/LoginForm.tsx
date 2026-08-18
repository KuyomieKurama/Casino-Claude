"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { authClient } from "./authClient";
import { OAuthButtons, type OAuthProviderOption } from "./OAuthButtons";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DEMO_ACCOUNT_HINT, PASSWORD_HINT } from "@/lib/constants";
import { firstErrorField, validateLogin, type FieldErrors, type LoginFields } from "@/lib/validation";
import { safeNext } from "@/lib/safe-redirect";
import { loginErrorMessage } from "@/lib/auth-errors";

export interface LoginFormProps {
  /** Nur aktive Provider (server/auth/providers.ts), bereits auf key+displayName reduziert. */
  providers: readonly OAuthProviderOption[];
}

export function LoginForm({ providers }: LoginFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<LoginFields>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const nextParam = params.get("next");
  const nextTarget = safeNext(nextParam);
  const registerHref = nextParam ? `/register?next=${encodeURIComponent(nextParam)}` : "/register";

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Das Passwort wird direkt aus dem Feld gelesen, validiert und danach verworfen (Regel 5).
    // Es liegt zu keinem Zeitpunkt im React-State, im Context oder im Storage.
    const password = passwordRef.current?.value ?? "";
    const next = validateLogin({ email, password });
    setErrors(next);
    setFormError(null);
    const first = firstErrorField(["email", "password"], next);
    if (first) {
      (first === "email" ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    const { error } = await authClient.signIn.email({ email, password, rememberMe });
    if (passwordRef.current) passwordRef.current.value = "";
    setSubmitting(false);

    if (error) {
      setFormError(loginErrorMessage(error));
      passwordRef.current?.focus();
      return;
    }

    toast({ tone: "success", title: "Angemeldet." });
    // Die Root- und Nutzerbereich-Layouts lesen die Sitzung serverseitig (server/auth/guards.ts)
    // — ohne refresh() zeigt der bereits gerenderte Client-Baum (Header u. a.) weiterhin den
    // alten, abgemeldeten Zustand, bis irgendeine andere Navigation ihn ohnehin neu lädt.
    router.refresh();
    router.replace(nextTarget);
  };

  return (
    <Card as="section" signature aria-labelledby="login-title" className="anim-panel-in mx-auto w-full max-w-md space-y-5 shadow-rest">
      <div>
        <h1 id="login-title" className="font-display text-2xl text-primary">
          Anmelden
        </h1>
        <p className="mt-1 text-sm text-muted">{DEMO_ACCOUNT_HINT}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError ? (
          <p role="alert" className="rounded-control border border-danger/60 bg-surface px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}
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
        <Checkbox label="Eingeloggt bleiben" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} hint="Ohne Haken endet die Sitzung nach einer Stunde." />
        <Button type="submit" variant="primary" fullWidth loading={submitting} className="focus-glow" iconLeft={<LogIn className="size-4" aria-hidden="true" />}>
          Anmelden
        </Button>
      </form>
      <OAuthButtons providers={providers} callbackURL={nextTarget} />
      <p className="text-sm text-muted">
        Noch kein Konto?{" "}
        <Link href={registerHref} className="font-medium text-gold hover:text-gold-strong">
          Jetzt anlegen
        </Link>
      </p>
    </Card>
  );
}
