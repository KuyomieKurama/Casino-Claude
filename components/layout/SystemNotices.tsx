"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { usePersistence } from "@/state/PersistenceContext";
import { useRg, useRgStatus } from "@/state/RgContext";
import { formatDuration } from "@/lib/formatters";

/**
 * Systemweite Hinweise ohne eigene Oberfläche:
 *  - Storage-Status beim Start (defekt, fremde Version, blockiert) — einmaliger Toast
 *  - Responsible-Gaming-Erinnerung nach längerer Nutzung
 *
 * Das frühere „Sitzung abgelaufen“-Modal (clientseitige TTL-Prüfung gegen
 * state/session-reducer.ts) entfällt: Die Sitzungsdauer bestimmt jetzt der Server
 * (server/auth/create-auth.ts, session.expiresIn/rememberMe-Hook). Läuft eine Sitzung ab,
 * greift bei der nächsten Navigation in den Nutzerbereich das serverseitige Gating
 * (app/(user)/layout.tsx, app/admin/page.tsx) — ein separater Client-Timer wäre nur noch eine
 * zweite, potenziell abweichende Quelle für dieselbe Information.
 */
export function SystemNotices() {
  const { toast } = useToast();
  const { hydrated, status, persistent } = usePersistence();
  const rg = useRg();
  const rgStatus = useRgStatus(15_000);
  const router = useRouter();
  const storageNoticeShown = useRef(false);

  useEffect(() => {
    if (!hydrated || storageNoticeShown.current) return;
    storageNoticeShown.current = true;
    if (status === "corrupt") {
      toast({
        tone: "warning",
        title: "Gespeicherte lokale Daten waren beschädigt.",
        description: "Sie wurden verworfen. Guthaben, Historie und Responsible-Gaming-Einstellungen sind davon nicht betroffen, sie liegen serverseitig.",
        duration: 8000,
      });
    } else if (status === "unsupported-version") {
      toast({
        tone: "warning",
        title: "Gespeicherte lokale Daten stammen aus einer anderen Version.",
        description: "Sie wurden verworfen statt geraten. Guthaben, Historie und Responsible-Gaming-Einstellungen sind davon nicht betroffen, sie liegen serverseitig.",
        duration: 8000,
      });
    }
    if (!persistent) {
      toast({
        tone: "warning",
        title: "Speichern ist in diesem Browser nicht möglich.",
        description: "Favoriten und lokale Anzeigeeinstellungen gehen beim Neuladen verloren. Guthaben, Historie und Responsible-Gaming-Einstellungen sind davon nicht betroffen, sie liegen serverseitig.",
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

  return null;
}
