"use client";

import { Coins } from "lucide-react";
import { DemoBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatCredits } from "@/lib/formatters";
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
 */
export function BalanceDisplay({ variant = "inline", className }: BalanceDisplayProps) {
  const { hydrated, wallet } = useWallet();
  const total = availableMinor(wallet);

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
