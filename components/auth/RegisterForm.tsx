"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useSession } from "@/state/SessionContext";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DEMO_ACCOUNT_HINT, PASSWORD_HINT } from "@/lib/constants";
import { firstErrorField, validateRegister, PASSWORD_MIN_LENGTH, type FieldErrors, type RegisterFields } from "@/lib/validation";
import { safeNext } from "./LoginForm";

const ORDER: readonly RegisterFields[] = ["displayName", "email", "password", "passwordConfirm", "acceptTerms"];

export function RegisterForm() {
  const { register, hydrated } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<RegisterFields>>({});
  const refs = {
    displayName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    passwordConfirm: useRef<HTMLInputElement>(null),
    acceptTerms: useRef<HTMLInputElement>(null),
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Passwörter werden nur aus den Feldern gelesen, geprüft und verworfen (Regel 5) — nie in State oder Storage.
    const password = refs.password.current?.value ?? "";
    const passwordConfirm = refs.passwordConfirm.current?.value ?? "";
    const next = validateRegister({ displayName, email, password, passwordConfirm, acceptTerms });
    setErrors(next);
    const first = firstErrorField(ORDER, next);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    register({ displayName, email });
    if (refs.password.current) refs.password.current.value = "";
    if (refs.passwordConfirm.current) refs.passwordConfirm.current.value = "";
    toast({ tone: "success", title: "Demo-Konto angelegt.", description: "Gespeichert wurden nur Anzeigename und E-Mail — kein Passwort." });
    router.replace(safeNext(params.get("next")));
  };

  return (
    <Card as="section" signature aria-labelledby="register-title" className="mx-auto w-full max-w-md space-y-5">
      <div>
        <h1 id="register-title" className="font-display text-2xl text-primary">
          Demo-Konto anlegen
        </h1>
        <p className="mt-1 text-sm text-muted">{DEMO_ACCOUNT_HINT}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input ref={refs.displayName} label="Anzeigename" name="displayName" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={errors.displayName} required />
        <Input ref={refs.email} label="E-Mail" type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <Input ref={refs.password} label="Passwort" type="password" name="password" autoComplete="new-password" hint={`${PASSWORD_HINT} Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`} error={errors.password} required />
        <Input ref={refs.passwordConfirm} label="Passwort bestätigen" type="password" name="passwordConfirm" autoComplete="new-password" error={errors.passwordConfirm} required />
        <Checkbox
          ref={refs.acceptTerms}
          label={
            <>
              Ich stimme den <Link href="/help" className="font-medium text-gold hover:text-gold-strong">Demo-Nutzungsbedingungen</Link> zu und verstehe, dass dies ein Prototyp ohne Echtgeld ist.
            </>
          }
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          error={errors.acceptTerms}
        />
        <Button type="submit" variant="primary" fullWidth disabled={!hydrated} iconLeft={<UserPlus className="size-4" aria-hidden="true" />}>
          Demo-Konto anlegen
        </Button>
      </form>
      <p className="text-sm text-muted">
        Schon ein Demo-Konto?{" "}
        <Link href="/login" className="font-medium text-gold hover:text-gold-strong">
          Anmelden
        </Link>
      </p>
    </Card>
  );
}
