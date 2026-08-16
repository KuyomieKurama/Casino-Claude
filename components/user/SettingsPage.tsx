"use client";

import { useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "@/state/SessionContext";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { clearPersisted } from "@/lib/storage";
import { validateDisplayName } from "@/lib/validation";

/**
 * Einstellungen: Profil, Sprache (UI-Attrappe, Annahme A2), Demo-Admin-Umschalter (Konzept C1),
 * alle Demo-Daten löschen.
 */
export function SettingsPage() {
  const { user, updateProfile, adminEnabled, setAdminEnabled, logout } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState(user?.displayName ?? "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Einstellungen</h1>
      </header>

      <Card as="section" aria-labelledby="profile-title" className="space-y-4">
        <h2 id="profile-title" className="text-md font-semibold text-primary">
          Profil
        </h2>
        <form
          className="flex flex-col gap-3 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            const err = validateDisplayName(name);
            setNameError(err);
            if (err) return;
            updateProfile(name);
            toast({ tone: "success", title: "Anzeigename gespeichert." });
          }}
          noValidate
        >
          <Input label="Anzeigename" value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
          <Input label="E-Mail" value={user?.email ?? ""} readOnly hint="Die E-Mail dient nur zur Wiedererkennung des Demo-Kontos auf diesem Gerät." />
          <Select label="Sprache" options={[{ value: "de", label: "Deutsch" }]} value="de" onChange={() => undefined} hint="Sprachauswahl ist im Prototyp eine Attrappe (nur Deutsch)." />
          <Button type="submit" variant="outline" className="self-start">
            Speichern
          </Button>
        </form>
      </Card>

      <Card as="section" aria-labelledby="admin-title" className="space-y-3 border-warning/40">
        <h2 id="admin-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <ShieldAlert className="size-5 text-warning" aria-hidden="true" /> Demo-Admin-Ansicht
        </h2>
        <p className="measure text-sm text-muted">
          In einer rein clientseitigen App ist jede Rollenprüfung Anzeigelogik, kein Schutz. Deshalb gibt es hier keinen simulierten Admin-Login — das wäre Sicherheitstheater. Echte Autorisierung gehört serverseitig.
        </p>
        <Checkbox
          label="Demo-Admin-Ansicht aktivieren"
          checked={adminEnabled}
          onChange={(e) => {
            setAdminEnabled(e.target.checked);
            toast({ tone: "info", title: e.target.checked ? "Demo-Admin-Ansicht aktiviert." : "Demo-Admin-Ansicht deaktiviert." });
          }}
          hint="Der Admin-Bereich (M3) ist in dieser Iteration noch nicht gebaut; der Umschalter zeigt das Prinzip."
        />
      </Card>

      <Card as="section" aria-labelledby="danger-title" className="space-y-3 border-danger/40">
        <h2 id="danger-title" className="text-md font-semibold text-primary">
          Demo-Daten löschen
        </h2>
        <p className="measure text-sm text-muted">Entfernt Demo-Konto, Guthaben, Historie, Favoriten und Responsible-Gaming-Einstellungen aus diesem Browser. Eine Selbstsperre wird dadurch ebenfalls entfernt — bitte bewusst entscheiden.</p>
        <Button variant="danger" onClick={() => setConfirmClear(true)} iconLeft={<Trash2 className="size-4" aria-hidden="true" />}>
          Alle Demo-Daten löschen
        </Button>
      </Card>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Alle Demo-Daten löschen?"
        description="Das lässt sich nicht rückgängig machen. Die Seite wird danach neu geladen."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                logout();
                clearPersisted();
                router.push("/");
                // Harter Reload, damit alle Provider sauber mit Defaults starten
                setTimeout(() => window.location.reload(), 50);
              }}
            >
              Endgültig löschen
            </Button>
          </>
        }
      />
    </div>
  );
}
