"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { authClient } from "./authClient";
import { OAuthButtons, type OAuthProviderOption } from "./OAuthButtons";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DEMO_ACCOUNT_HINT, PASSWORD_HINT } from "@/lib/constants";
import { firstErrorField, validateRegister, PASSWORD_MIN_LENGTH, type FieldErrors, type RegisterFields } from "@/lib/validation";
import { safeNext } from "@/lib/safe-redirect";
import { registerErrorMessage } from "@/lib/auth-errors";

export interface RegisterFormProps {
  /** Nur aktive Provider (server/auth/providers.ts), bereits auf key+displayName reduziert. */
  providers: readonly OAuthProviderOption[];
}

export function RegisterForm({ providers }: RegisterFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<RegisterFields>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const refs = {
    displayName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    passwordConfirm: useRef<HTMLInputElement>(null),
    acceptTerms: useRef<HTMLInputElement>(null),
  };
  const ORDER: readonly RegisterFields[] = ["displayName", "email", "password", "passwordConfirm", "acceptTerms"];

  const nextParam = params.get("next");
  const nextTarget = safeNext(nextParam);
  const loginHref = nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login";

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Passwörter werden nur aus den Feldern gelesen, geprüft und verworfen (Regel 5) — nie in State oder Storage.
    const password = refs.password.current?.value ?? "";
    const passwordConfirm = refs.passwordConfirm.current?.value ?? "";
    const next = validateRegister({ displayName, email, password, passwordConfirm, acceptTerms });
    setErrors(next);
    setFormError(null);
    const first = firstErrorField(ORDER, next);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    setSubmitting(true);
    const { error } = await authClient.signUp.email({ email, password, name: displayName });
    if (refs.password.current) refs.password.current.value = "";
    if (refs.passwordConfirm.current) refs.passwordConfirm.current.value = "";
    setSubmitting(false);

    if (error) {
      setFormError(registerErrorMessage(error));
      refs.email.current?.focus();
      return;
    }

    // Bewusst KEINE automatische Anmeldung (server/auth/create-auth.ts, autoSignIn: false,
    // Befund 2 des Security-Reviews): Ob die E-Mail neu war oder schon existierte, sieht von
    // außen identisch aus — genau dieselbe Erfolgsmeldung, derselbe Weg zur Anmeldung, für
    // BEIDE Fälle. Ein anschließender Login-Versuch entscheidet erst über den echten Zustand.
    toast({
      tone: "success",
      title: "Fast geschafft.",
      description: "Falls die E-Mail neu war, wurde ein Konto angelegt. Bitte melde dich jetzt damit an.",
      duration: 8000,
    });
    router.replace(loginHref);
  };

  return (
    <Card as="section" signature aria-labelledby="register-title" className="anim-panel-in mx-auto w-full max-w-md space-y-5 shadow-rest">
      <div>
        <h1 id="register-title" className="font-display text-2xl text-primary">
          Konto anlegen
        </h1>
        <p className="mt-1 text-sm text-muted">{DEMO_ACCOUNT_HINT}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError ? (
          <p role="alert" className="rounded-control border border-danger/60 bg-surface px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <Input ref={refs.displayName} label="Anzeigename" name="displayName" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={errors.displayName} required />
        <Input ref={refs.email} label="E-Mail" type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <Input ref={refs.password} label="Passwort" type="password" name="password" autoComplete="new-password" hint={`${PASSWORD_HINT} Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`} error={errors.password} required />
        <Input ref={refs.passwordConfirm} label="Passwort bestätigen" type="password" name="passwordConfirm" autoComplete="new-password" error={errors.passwordConfirm} required />
        <Checkbox
          ref={refs.acceptTerms}
          label={
            <>
              Ich stimme den <Link href="/help" className="font-medium text-gold hover:text-gold-strong">Nutzungsbedingungen</Link> zu und verstehe, dass dies ein Prototyp ohne Echtgeld ist.
            </>
          }
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          error={errors.acceptTerms}
        />
        <Button type="submit" variant="primary" fullWidth loading={submitting} className="focus-glow" iconLeft={<UserPlus className="size-4" aria-hidden="true" />}>
          Konto anlegen
        </Button>
      </form>
      <OAuthButtons providers={providers} callbackURL={nextTarget} />
      <p className="text-sm text-muted">
        Schon ein Konto?{" "}
        <Link href={loginHref} className="font-medium text-gold hover:text-gold-strong">
          Anmelden
        </Link>
      </p>
    </Card>
  );
}
