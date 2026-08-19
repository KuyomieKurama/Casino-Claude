"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";

export type LimitDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  /** Text der Bestätigungs-Checkbox (Schritt 1). Ohne Haken bleibt Schritt 2 gesperrt. */
  acknowledgement: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  children?: ReactNode;
};

/**
 * Zwei-Schritt-Dialog für Sperren, Pausen und deren Aufhebung (§8.9): erst bewusst bestätigen,
 * dann ausführen. Nie über einen Banner-Button. Die Checkbox ist nie vorausgewählt.
 */
export function LimitDialog({ open, onClose, onConfirm, title, description, acknowledgement, confirmLabel, tone = "default", children }: LimitDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    if (!open) setAcknowledged(false);
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          {/* Responsible Gaming bleibt ohne Verkaufsästhetik (Auftrag): "outline" statt "primary" —
              Gold bleibt dem Spielbereich vorbehalten, auch im nicht-destruktiven Standardfall
              (z. B. "Pause starten"). */}
          <Button variant={tone === "danger" ? "danger" : "outline"} disabled={!acknowledged} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        <Checkbox label={acknowledgement} checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
      </div>
    </Modal>
  );
}
