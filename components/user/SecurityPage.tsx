"use client";

import { KeyRound, Laptop, ShieldOff, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
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

/**
 * Sicherheit (§8.8, überarbeitet): Passwortänderung und Zwei-Faktor-Authentifizierung sind derzeit
 * nicht umgesetzt — es gibt weder einen Endpunkt, der ein neues Passwort entgegennimmt,
 * noch einen E-Mail-Versand für einen Bestätigungs- oder Rücksetzlink, noch einen Dienst, der
 * 2FA-Codes ausstellt und prüft. Ein Formular ohne wirkende Gegenstelle stünde hier nur zum Schein
 * — deshalb zeigt diese Seite an seiner Stelle einen erklärenden Hinweis, kein Eingabeformular
 * (Auftrag „Ehrlichkeit der Oberfläche"). Geräte und Login-Historie bleiben als klar markierte
 * Beispieldaten erhalten, weil sie nichts vortäuschen, das nicht da ist — sie illustrieren nur,
 * was hier zusätzlich stehen könnte.
 */
export function SecurityPage() {
  return (
    <div className="anim-panel-in space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Sicherheit</h1>
        <p className="mt-1 text-sm text-muted">Passwortänderung und Zwei-Faktor-Authentifizierung sind derzeit nicht umgesetzt. Geräte und Login-Historie unten sind Beispieldaten zur Illustration, keine echten Aufzeichnungen.</p>
      </header>

      <Card as="section" aria-labelledby="pw-title" className="space-y-2">
        <h2 id="pw-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <KeyRound className="size-5 text-muted" aria-hidden="true" /> Passwort ändern
          <Badge tone="neutral">Nicht möglich</Badge>
        </h2>
        <p className="measure text-sm text-muted">
          Es gibt keinen Endpunkt, der ein neues Passwort entgegennimmt, und keinen E-Mail-Versand für einen Bestätigungs- oder Rücksetzlink. Ein Formular ohne wirkende Gegenstelle würde hier nur vortäuschen, dass sich etwas ändert — deshalb bleibt es weg.
        </p>
      </Card>

      <Card as="section" aria-labelledby="2fa-title" className="space-y-2">
        <h2 id="2fa-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <ShieldOff className="size-5 text-muted" aria-hidden="true" /> Zwei-Faktor-Authentifizierung
          <Badge tone="neutral">Nicht möglich</Badge>
        </h2>
        <p className="measure text-sm text-muted">
          2FA benötigt einen Dienst, der Codes ausstellt und prüft. Den gibt es hier noch nicht — deshalb bleibt die Funktion vollständig weg statt nur deaktiviert angezeigt zu werden. Ein Echtgeldprodukt sollte 2FA verpflichtend anbieten.
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
