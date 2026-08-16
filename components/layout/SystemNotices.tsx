"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { usePersistence } from "@/state/PersistenceContext";
import { useRg, useRgStatus } from "@/state/RgContext";
import { useSession } from "@/state/SessionContext";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/formatters";

/**
 * Systemweite Hinweise ohne eigene Oberfläche:
 *  - Storage-Status beim Start (defekt, fremde Version, blockiert) — einmaliger Toast
 *  - Responsible-Gaming-Erinnerung nach längerer Nutzung
 *  - „Sitzung abgelaufen“-Modal beim nächsten Interagieren
 */
export function SystemNotices() {
  const { toast } = useToast();
  const { hydrated, status, persistent } = usePersistence();
  const rg = useRg();
  const rgStatus = useRgStatus(15_000);
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const storageNoticeShown = useRef(false);

  useEffect(() => {
    if (!hydrated || storageNoticeShown.current) return;
    storageNoticeShown.current = true;
    if (status === "corrupt") {
      toast({
        tone: "warning",
        title: "Gespeicherte Demo-Daten waren beschädigt.",
        description: "Sie wurden verworfen. Der Prototyp startet mit Standardwerten.",
        duration: 8000,
      });
    } else if (status === "unsupported-version") {
      toast({
        tone: "warning",
        title: "Gespeicherte Demo-Daten stammen aus einer anderen Version.",
        description: "Sie wurden verworfen statt geraten. Der Prototyp startet mit Standardwerten.",
        duration: 8000,
      });
    }
    if (!persistent) {
      toast({
        tone: "warning",
        title: "Speichern ist in diesem Browser nicht möglich.",
        description: "Der Prototyp läuft im Arbeitsspeicher. Guthaben, Favoriten und Einstellungen gehen beim Neuladen verloren.",
        duration: 0,
      });
    }
  }, [hydrated, status, persistent, toast]);

  // Erinnerung nach längerer Nutzung — nur wenn nicht ohnehin gesperrt/pausiert.
  useEffect(() => {
    if (!rgStatus.hydrated || !rgStatus.reminderDue || rgStatus.blocked) return;
    rg.markReminderShown();
    toast({
      tone: "info",
      title: `Du spielst seit ${formatDuration(rgStatus.sessionElapsedMs)}.`,
      description: "Kurze Erinnerung aus dem Bereich Responsible Gaming. Eine Pause ist jederzeit möglich.",
      duration: 10_000,
      action: { label: "Zu Responsible Gaming", onClick: () => router.push("/responsible-gaming") },
    });
  }, [rgStatus.hydrated, rgStatus.reminderDue, rgStatus.blocked, rgStatus.sessionElapsedMs, rg, toast, router]);

  // Sitzungsablauf beim nächsten Interagieren prüfen
  useEffect(() => {
    if (!session.hydrated) return;
    const check = () => session.checkExpiry();
    document.addEventListener("pointerdown", check, { passive: true });
    document.addEventListener("keydown", check);
    return () => {
      document.removeEventListener("pointerdown", check);
      document.removeEventListener("keydown", check);
    };
  }, [session]);

  return (
    <Modal
      open={session.state.expiredNotice}
      onClose={session.dismissExpired}
      title="Deine Demo-Sitzung ist abgelaufen."
      description="Zum Schutz des Demo-Kontos endet eine Sitzung ohne „Eingeloggt bleiben“ nach einer Stunde. Melde dich erneut an, um in den Nutzerbereich zurückzukehren."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={session.dismissExpired}>
            Später
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              session.dismissExpired();
              router.push(`/login?next=${encodeURIComponent(pathname || "/")}`);
            }}
          >
            Erneut anmelden
          </Button>
        </>
      }
    />
  );
}
