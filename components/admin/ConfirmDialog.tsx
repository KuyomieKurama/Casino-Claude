"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger";
  busy?: boolean;
}

/**
 * Bestätigungsdialog für kritische Admin-Aktionen (Admin-Auftrag „Übergreifend": „Kritische
 * Änderungen ... erfordern eine Bestätigung"): Konto sperren, Modus/Titel deaktivieren, Sitzungen
 * widerrufen. Bewusst `variant="outline"` statt `"primary"` für den bestätigenden Button — Gold
 * (`primary`) bleibt dem Spielbereich vorbehalten (siehe components/admin/AdminHeader.tsx).
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel, tone = "default", busy = false }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant={tone === "danger" ? "danger" : "outline"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
