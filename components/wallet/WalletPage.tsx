"use client";

import Link from "next/link";
import { useWallet } from "@/state/WalletContext";
import { DemoWallet } from "./DemoWallet";
import { TransactionList } from "./TransactionList";

/** Wallet (§11): eigene Seite mobil, zweispaltig ab Tablet, Seitenpanel plus Historie auf Desktop. */
export function WalletPage() {
  const { hydrated, transactions } = useWallet();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Wallet</h1>
        <p className="mt-1 text-sm text-muted">Demo-Guthaben verwalten. Jede Änderung wird als Transaktion protokolliert.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <DemoWallet />
        <section aria-labelledby="recent-title" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 id="recent-title" className="text-md font-semibold text-primary">
              Letzte Bewegungen
            </h2>
            <Link href="/history" className="inline-flex min-h-11 items-center text-sm font-medium text-gold hover:text-gold-strong">
              Gesamte Historie
            </Link>
          </div>
          <TransactionList transactions={transactions} hydrated={hydrated} limit={10} />
        </section>
      </div>
    </div>
  );
}
