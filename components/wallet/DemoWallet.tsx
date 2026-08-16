"use client";

import { useState } from "react";
import { Plus, RotateCcw, Sparkles, Ticket } from "lucide-react";
import { useWallet } from "@/state/WalletContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { DemoBadge } from "@/components/ui/Badge";
import { formatCredits, formatCreditsWithUnit } from "@/lib/formatters";
import { START_BALANCE_MINOR, TOP_UP_OPTIONS_MINOR } from "@/lib/constants";
import { cn } from "@/lib/cn";

export type DemoWalletProps = {
  className?: string;
  compact?: boolean;
};

/**
 * Demo-Wallet (§8.6): Start 1.000,00, Bonus 0,00, 0 Freirunden. Aktionen +100, +500, Zurücksetzen.
 * Vor jeder Aktion ein Kontexthinweis (Kennzeichnung Ebene 3). Jede Änderung ist eine Transaktion —
 * das erledigt der Reducer, hier wird nur angezeigt und ausgelöst.
 */
export function DemoWallet({ className, compact }: DemoWalletProps) {
  const { hydrated, wallet, topUp, reset } = useWallet();
  const { toast } = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  const handleTopUp = (amount: number) => {
    const rejection = topUp(amount);
    if (rejection) toast({ tone: "warning", title: rejection.message });
    else toast({ tone: "success", title: `${formatCreditsWithUnit(amount)} Demo-Credits hinzugefügt.`, description: "Kein Echtgeld — nur Demo-Guthaben." });
  };

  const handleReset = () => {
    const rejection = reset();
    setConfirmReset(false);
    if (rejection) toast({ tone: "warning", title: rejection.message });
    else toast({ tone: "success", title: `Demo-Guthaben auf ${formatCreditsWithUnit(START_BALANCE_MINOR)} zurückgesetzt.` });
  };

  return (
    <Card as="section" signature aria-labelledby="wallet-title" className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="wallet-title" className="text-sm font-medium text-muted">
            Demo-Guthaben
          </h2>
          <div className="mt-1 flex items-baseline gap-2" aria-live="polite">
            {hydrated ? (
              <span className="flex flex-wrap items-baseline gap-x-1.5 text-2xl font-semibold leading-tight text-primary">
                {/* Nur die Zahl bleibt zusammen; die Einheit darf umbrechen. Sonst sprengt ein
                    großes Guthaben die schmale Wallet-Spalte und die Seite scrollt horizontal. */}
                <span className="tabular whitespace-nowrap">{formatCredits(wallet.demoBalanceMinor)}</span>
                <span className="text-base font-normal text-muted">Credits</span>
              </span>
            ) : (
              <Skeleton className="h-8 w-[10ch]" />
            )}
          </div>
        </div>
        <DemoBadge />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-control border border-border-subtle p-3">
          <dt className="flex items-center gap-1.5 text-muted">
            <Sparkles className="size-3.5" aria-hidden="true" /> Bonus-Credits
          </dt>
          <dd className="tabular mt-1 font-semibold text-primary">
            {hydrated ? `${formatCredits(wallet.bonusBalanceMinor)} Credits` : <Skeleton className="h-5 w-[8ch]" />}
          </dd>
        </div>
        <div className="rounded-control border border-border-subtle p-3">
          <dt className="flex items-center gap-1.5 text-muted">
            <Ticket className="size-3.5" aria-hidden="true" /> Freirunden
          </dt>
          <dd className="tabular mt-1 font-semibold text-primary">{hydrated ? wallet.freeSpins : <Skeleton className="h-5 w-[3ch]" />}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <p className="text-xs text-muted">Demo-Credits hinzufügen. Es wird kein Echtgeld bewegt.</p>
        <div className="flex flex-wrap gap-2">
          {TOP_UP_OPTIONS_MINOR.map((amount) => (
            <Button
              key={amount}
              variant="outline"
              size={compact ? "sm" : "md"}
              disabled={!hydrated || wallet.roundInFlight}
              onClick={() => handleTopUp(amount)}
              iconLeft={<Plus className="size-4" aria-hidden="true" />}
              aria-label={`${formatCredits(amount)} Demo-Credits hinzufügen`}
            >
              {formatCredits(amount).replace(",00", "")}
            </Button>
          ))}
          <Button
            variant="ghost"
            size={compact ? "sm" : "md"}
            disabled={!hydrated || wallet.roundInFlight}
            onClick={() => setConfirmReset(true)}
            iconLeft={<RotateCcw className="size-4" aria-hidden="true" />}
          >
            Zurücksetzen
          </Button>
        </div>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Demo-Guthaben zurücksetzen?"
        description={`Das Demo-Guthaben wird auf ${formatCreditsWithUnit(START_BALANCE_MINOR)} gesetzt, Bonus-Credits und Freirunden auf 0. Die Historie bleibt erhalten; der Vorgang wird als Transaktion protokolliert.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={handleReset}>
              Zurücksetzen
            </Button>
          </>
        }
      />
    </Card>
  );
}
