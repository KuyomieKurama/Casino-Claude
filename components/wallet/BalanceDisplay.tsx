"use client";

import { Coins } from "lucide-react";
import { DemoBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatCredits } from "@/lib/formatters";
import { useSession } from "@/state/SessionContext";
import { useWallet } from "@/state/WalletContext";
import { availableMinor } from "@/state/wallet-reducer";
import { cn } from "@/lib/cn";

export type BalanceDisplayProps = {
  variant?: "header" | "inline";
  className?: string;
};

/**
 * Guthaben mit Einheit „Credits“ und DEMO-Kürzel (Kennzeichnung Ebene 2).
 * Vor der Hydration ein Skeleton in Zielgröße — nie ein Platzhalterwert.
 *
 * Ohne Sitzung wird NICHTS angezeigt (Auftrag „Spielen nur angemeldet"): der Server liefert für
 * anonyme Besucher weiterhin einen hypothetischen Startguthaben-Wert (server/wallet/wallet-read-
 * model.ts, `resolveWalletBalance(db, null)`) — der wäre hier aber irreführend, da ohne Anmeldung
 * gar kein Wallet existiert und auch keines angelegt werden kann. Gilt für BEIDE Varianten (nicht
 * nur `header`): `inline` wird zwar aktuell ausschließlich innerhalb angemeldeter Bereiche
 * verwendet, aber ein Guthabenwert ohne Konto ist grundsätzlich nie ein sinnvoller Anzeigewert.
 */
export function BalanceDisplay({ variant = "inline", className }: BalanceDisplayProps) {
  const { isLoggedIn } = useSession();
  const { hydrated, wallet } = useWallet();
  const total = availableMinor(wallet);

  if (!isLoggedIn) return null;

  if (variant === "header") {
    return (
      <span className={cn("inline-flex h-11 items-center gap-1.5 rounded-control border border-border-subtle bg-surface px-2 sm:gap-2 sm:px-2.5", className)} aria-live="polite">
        <Coins className="hidden size-4 text-gold xs:block" aria-hidden="true" />
        {hydrated ? (
          <span className="tabular text-sm font-semibold text-primary">
            {formatCredits(total)} <span className="font-normal text-muted max-xs:sr-only">Credits</span>
          </span>
        ) : (
          <Skeleton className="h-4 w-[9.5ch]" />
        )}
        <DemoBadge />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      {hydrated ? (
        <span className="flex flex-wrap items-baseline gap-x-1.5 text-2xl font-semibold leading-tight text-primary">
          <span className="tabular whitespace-nowrap">{formatCredits(total)}</span>
          <span className="text-base font-normal text-muted">Credits</span>
        </span>
      ) : (
        <Skeleton className="h-8 w-[10ch]" />
      )}
      <DemoBadge />
    </span>
  );
}
