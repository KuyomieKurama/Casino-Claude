"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { promotions, type Promotion } from "@/data/promotions";
import { useWallet } from "@/state/WalletContext";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";

const statusLabel: Record<Promotion["status"], { label: string; tone: "teal" | "neutral" | "warning" }> = {
  active: { label: "Aktiv", tone: "teal" },
  upcoming: { label: "Demnächst (Mock)", tone: "neutral" },
  expired: { label: "Beendet (Mock)", tone: "warning" },
};

/** Promotions mit Detailansicht und Aktivieren-Aktion (Kontexthinweis vor der Aktion). */
export function PromotionsList() {
  const { hydrated, grantBonus, transactions } = useWallet();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<Promotion | null>(null);

  const alreadyClaimed = (p: Promotion) => transactions.some((t) => t.type === "bonus_grant" && t.roundId === p.id);
  const hasReward = (p: Promotion) => (p.reward.bonusMinor ?? 0) > 0 || (p.reward.freeSpins ?? 0) > 0;

  const activate = (p: Promotion) => {
    const rejection = grantBonus({ bonusMinor: p.reward.bonusMinor ?? 0, freeSpins: p.reward.freeSpins ?? 0, sourceId: p.id });
    setConfirm(null);
    if (rejection) toast({ tone: "warning", title: rejection.message });
    else toast({ tone: "success", title: `„${p.title}“ aktiviert.`, description: `${p.rewardLabel} wurde deinem Guthaben gutgeschrieben.` });
  };

  return (
    <>
      <ul className="grid gap-4 md:grid-cols-3">
        {promotions.map((p) => {
          const s = statusLabel[p.status];
          const claimed = alreadyClaimed(p);
          return (
            <li key={p.id} id={p.slug} className="scroll-mt-32">
              <Card as="article" className="hover-elevate flex h-full flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <Gift className="size-5 text-gold" aria-hidden="true" />
                </div>
                <h2 className="font-display text-lg text-primary">{p.title}</h2>
                <p className="text-sm text-muted">{p.description}</p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Belohnung</dt>
                    <dd className="text-right font-medium text-primary">{p.rewardLabel}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Gültigkeit</dt>
                    <dd className="text-right text-primary/90">{p.validUntilLabel}</dd>
                  </div>
                </dl>
                <div className="mt-auto pt-2">
                  {p.status === "active" && hasReward(p) ? (
                    <Button variant="outline" fullWidth disabled={!hydrated || claimed} onClick={() => setConfirm(p)}>
                      {claimed ? "Bereits aktiviert" : "Aktivieren"}
                    </Button>
                  ) : (
                    <Button variant="outline" fullWidth disabled>
                      Nur Ansicht
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? `„${confirm.title}“ aktivieren?` : ""}
        description={confirm ? `${confirm.rewardLabel} wird deinem Guthaben gutgeschrieben — ohne Bedingungen. Es wird kein Echtgeld bewegt.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={() => confirm && activate(confirm)}>
              Aktivieren
            </Button>
          </>
        }
      />
    </>
  );
}
