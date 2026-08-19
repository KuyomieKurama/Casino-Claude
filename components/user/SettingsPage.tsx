"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "@/state/SessionContext";
import { useLogout } from "@/components/auth/useLogout";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { SoundSettingsSection } from "@/components/sound/SoundSettingsSection";
import { clearPersisted } from "@/lib/storage";

/**
 * Einstellungen: Profil (schreibgeschützte Übersicht — die Serversitzung ist jetzt die
 * Quelle der Wahrheit, ein clientseitiges Bearbeiten ohne Server-Gegenstück wäre irreführend),
 * Sprache (UI-Attrappe, Annahme A2), lokale Daten löschen.
 *
 * Der frühere Demo-Admin-Umschalter (Konzept C1, offener clientseitiger Schalter ohne echten
 * Schutz) entfällt ersatzlos: Admin-Zugriff ist jetzt eine echte, serverseitig geprüfte Rolle
 * (app/admin/page.tsx, server/auth/guards.ts) — ein Umschalter dafür wäre hier bedeutungslos.
 */
export function SettingsPage() {
  const { user } = useSession();
  const logout = useLogout();
  const { toast } = useToast();
  const router = useRouter();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="anim-panel-in space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Einstellungen</h1>
      </header>

      <Card as="section" aria-labelledby="profile-title" className="space-y-4">
        <h2 id="profile-title" className="text-md font-semibold text-primary">
          Profil <Badge tone="neutral" className="ml-1">Nur lesbar</Badge>
        </h2>
        {/* Ehrlichkeitshinweis (Auftrag): macht den bisher nur im Code-Kommentar festgehaltenen
            Grund für die Autoren sichtbar — die Serversitzung ist die Quelle der Wahrheit, ein
            Bearbeiten ohne Server-Gegenstück wäre irreführend. */}
        <p className="measure text-sm text-muted">Diese Angaben kommen aus deiner Serversitzung. Es gibt keinen serverseitigen Weg, sie hier zu ändern — ein bearbeitbares Feld ohne wirkende Gegenstelle würde nur vortäuschen, dass sich etwas speichern ließe.</p>
        <div className="flex flex-col gap-3 sm:max-w-md">
          <Input label="Anzeigename" value={user?.displayName ?? ""} readOnly hint="Wird beim Anmelden aus deinem Konto übernommen." />
          <Input label="E-Mail" value={user?.email ?? ""} readOnly hint="Die E-Mail dient nur zur Wiedererkennung des Kontos." />
          <Select label="Sprache" options={[{ value: "de", label: "Deutsch" }]} value="de" onChange={() => undefined} hint="Sprachauswahl ist aktuell eine Attrappe (nur Deutsch)." />
        </div>
      </Card>

      {/* Auftrag „Klang-Infrastruktur": ausführliche Ton-Einstellung, additiv zwischen Profil und
          den destruktiven Aktionen platziert — der kompakte Umschalter in der Kopfzeile
          (components/layout/Header.tsx) teilt sich denselben Zustand über useSound(). */}
      <SoundSettingsSection />

      <Card as="section" aria-labelledby="danger-title" className="space-y-3 border-danger/40">
        <h2 id="danger-title" className="text-md font-semibold text-primary">
          Lokale Daten löschen
        </h2>
        <p className="measure text-sm text-muted">Entfernt Favoriten und andere lokal in diesem Browser gespeicherte Anzeigedaten und meldet dich ab. Guthaben, Historie und Responsible-Gaming-Einstellungen sind serverseitig gespeichert und bleiben im Konto erhalten — auch eine Selbstsperre wird dadurch NICHT aufgehoben.</p>
        <Button variant="danger" onClick={() => setConfirmClear(true)} iconLeft={<Trash2 className="size-4" aria-hidden="true" />}>
          Lokale Daten löschen
        </Button>
      </Card>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Lokale Daten löschen?"
        description="Das lässt sich nicht rückgängig machen. Die Seite wird danach neu geladen."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await logout();
                clearPersisted();
                toast({ tone: "info", title: "Abgemeldet.", description: "Lokale Daten wurden entfernt." });
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
