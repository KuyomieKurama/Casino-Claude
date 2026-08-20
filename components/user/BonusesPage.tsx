"use client";

import { Gift, Info } from "lucide-react";
import { useWallet } from "@/state/WalletContext";
import { promotions } from "@/data/promotions";
import { formatCredits, formatDateTime } from "@/lib/formatters";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LinkButton } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

/** Boni: aktivierte Promotions und aktueller Bonus-/Freirundenstand. Rein additiv, ohne Bedingungen. */
export function BonusesPage() {
  const { hydrated, wallet, transactions } = useWallet();
  const grants = transactions.filter((t) => t.type === "bonus_grant").sort((a, b) => b.seq - a.seq);
  return (
    <div className="anim-panel-in space-y-xl">
      <header className="space-y-2">
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Boni</h1>
        <p className="text-sm text-muted">Bonus-Credits und Freirunden sind additiv und ohne Umsatzbedingungen. Es gibt nichts freizuspielen.</p>
        {/* Ehrlichkeitshinweis (Auftrag): grantBonus() bucht nur lokal (state/WalletContext.tsx) —
            ohne Server-Endpunkt für Boni überschreibt applyServerWallet() den Stand beim nächsten
            Laden wieder mit dem Serverwert. Anschauungsmaterial ohne dauerhafte Wirkung. */}
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>Anschauungsmaterial: Eine Aktivierung wirkt sofort in diesem Tab, aber nur dort. Nach einem Neuladen zeigt die Seite wieder den zuletzt bekannten Stand, da es dafür noch keinen Server-Endpunkt gibt.</span>
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-muted">Bonus-Credits</p>
          {/* <div> statt <p>: Skeleton rendert ein Block-Element, das laut HTML-Spezifikation
              nicht in ein <p> gehört (sonst Hydration-Warnung). */}
          <div className="tabular mt-1 text-xl font-semibold text-primary">{hydrated ? `${formatCredits(wallet.bonusBalanceMinor)} Credits` : <Skeleton className="h-7 w-24" />}</div>
        </Card>
        <Card>
          <p className="text-sm text-muted">Freirunden</p>
          <div className="tabular mt-1 text-xl font-semibold text-primary">{hydrated ? wallet.freeSpins : <Skeleton className="h-7 w-10" />}</div>
        </Card>
      </div>
      <section aria-labelledby="grants-title" className="space-y-3">
        <h2 id="grants-title" className="text-md font-semibold text-primary">
          Aktivierte Promotions
        </h2>
        {!hydrated ? (
          <Skeleton className="h-24 w-full" />
        ) : grants.length === 0 ? (
          // Kontoverwaltung bleibt golden-frei (§4/Auftrag): "outline" statt "primary".
          <EmptyState icon={<Gift aria-hidden="true" />} title="Noch keine Promotion aktiviert." text="Auf der Promotions-Seite kannst du Beispiele aktivieren." action={<LinkButton href="/promotions" variant="outline">Zu den Promotions</LinkButton>} compact />
        ) : (
          <ul className="stagger-list divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface">
            {grants.map((g) => {
              const promo = promotions.find((p) => p.id === g.roundId);
              return (
                <li key={g.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <p className="font-medium text-primary">{promo?.title ?? "Bonus"}</p>
                    <p className="text-xs text-muted">{formatDateTime(g.createdAt)}</p>
                  </div>
                  <p className="text-right text-primary/90">{promo?.rewardLabel ?? `${formatCredits(g.amountMinor)} Credits`}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
