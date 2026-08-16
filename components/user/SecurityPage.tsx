"use client";

import { useRef, useState, type FormEvent } from "react";
import { KeyRound, Laptop, ShieldOff, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { PASSWORD_HINT } from "@/lib/constants";
import { validatePassword } from "@/lib/validation";
import { formatDateTime } from "@/lib/formatters";

/** Mock-Daten, sichtbar als solche gekennzeichnet — keine echten Geräte, keine echten Logins. */
const mockDevices = [
  { id: "d1", name: "Dieses Gerät (Browser)", icon: Laptop, lastActive: new Date().toISOString(), current: true },
  { id: "d2", name: "Beispiel: Smartphone", icon: Smartphone, lastActive: "2026-08-13T21:14:00", current: false },
];
const mockLogins = [
  { at: "2026-08-15T08:20:00", where: "Beispiel: Berlin, DE", ok: true },
  { at: "2026-08-14T19:02:00", where: "Beispiel: Berlin, DE", ok: true },
  { at: "2026-08-12T07:45:00", where: "Beispiel: unbekannt", ok: false },
];

/** Sicherheit (§8.8): Passwortwechsel als Attrappe, 2FA deaktiviert mit Erklärung, Mock-Login-Historie und Geräte. */
export function SecurityPage() {
  const { toast } = useToast();
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Attrappe: Werte werden geprüft und sofort verworfen — nichts wird gespeichert (Regel 5).
    const current = currentRef.current?.value ?? "";
    const next = nextRef.current?.value ?? "";
    const confirm = confirmRef.current?.value ?? "";
    const errs: typeof errors = {};
    if (!current) errs.current = "Bitte gib dein aktuelles Passwort ein.";
    const nextErr = validatePassword(next);
    if (nextErr) errs.next = nextErr;
    if (next !== confirm) errs.confirm = "Die Passwörter stimmen nicht überein. Bitte gib beide identisch ein.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    for (const r of [currentRef, nextRef, confirmRef]) if (r.current) r.current.value = "";
    toast({ tone: "success", title: "Passwortwechsel simuliert.", description: "Attrappe: Es wurde nichts gespeichert oder übertragen." });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Sicherheit</h1>
        <p className="mt-1 text-sm text-muted">Alles auf dieser Seite ist Attrappe oder Beispieldatensatz — es gibt keinen Server, der etwas prüfen könnte.</p>
      </header>

      <Card as="section" aria-labelledby="pw-title" className="space-y-4">
        <h2 id="pw-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <KeyRound className="size-5 text-teal" aria-hidden="true" /> Passwort ändern (Attrappe)
        </h2>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:max-w-md">
          <Input ref={currentRef} label="Aktuelles Passwort" type="password" autoComplete="current-password" error={errors.current} />
          <Input ref={nextRef} label="Neues Passwort" type="password" autoComplete="new-password" hint={PASSWORD_HINT} error={errors.next} />
          <Input ref={confirmRef} label="Neues Passwort bestätigen" type="password" autoComplete="new-password" error={errors.confirm} />
          <Button type="submit" variant="outline" className="self-start">
            Passwort ändern
          </Button>
        </form>
      </Card>

      <Card as="section" aria-labelledby="2fa-title" className="space-y-2">
        <h2 id="2fa-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <ShieldOff className="size-5 text-muted" aria-hidden="true" /> Zwei-Faktor-Authentifizierung
          <Badge tone="neutral">Deaktiviert</Badge>
        </h2>
        <p className="measure text-sm text-muted">
          2FA benötigt einen Server, der Codes ausstellt und prüft. Dieser Prototyp hat keinen — deshalb bleibt die Funktion sichtbar, aber deaktiviert. Ein Echtgeldprodukt sollte 2FA verpflichtend anbieten.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="devices-title" className="space-y-3">
          <h2 id="devices-title" className="text-md font-semibold text-primary">
            Geräte <Badge tone="neutral" className="ml-1">Mock</Badge>
          </h2>
          <ul className="divide-y divide-border-subtle">
            {mockDevices.map(({ id, name, icon: Icon, lastActive, current }) => (
              <li key={id} className="flex items-center gap-3 py-3 text-sm">
                <Icon className="size-5 text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-primary">{name}</p>
                  <p className="text-xs text-muted">Zuletzt aktiv: {formatDateTime(lastActive)}</p>
                </div>
                {current ? <Badge tone="teal">Aktuell</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card as="section" aria-labelledby="logins-title" className="space-y-3">
          <h2 id="logins-title" className="text-md font-semibold text-primary">
            Login-Historie <Badge tone="neutral" className="ml-1">Mock</Badge>
          </h2>
          <ul className="divide-y divide-border-subtle">
            {mockLogins.map((l) => (
              <li key={l.at} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="text-primary">{formatDateTime(l.at)}</p>
                  <p className="text-xs text-muted">{l.where}</p>
                </div>
                <Badge tone={l.ok ? "success" : "warning"}>{l.ok ? "Erfolgreich" : "Fehlgeschlagen"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
