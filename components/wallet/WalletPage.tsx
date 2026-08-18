import Link from "next/link";
import type { Transaction } from "@/types/transaction";
import { DemoWallet } from "./DemoWallet";
import { TransactionList } from "./TransactionList";

export type WalletPageProps = {
  /**
   * Auftrag §2: die letzten Bewegungen kommen aus dem Server-Ledger
   * (app/(user)/wallet/page.tsx ⇒ server/wallet/ledger-history.ts::resolveRecentLedgerEntries),
   * nicht mehr aus dem lokalen Reducer (state/WalletContext.tsx). Schon fertig geladen — kein
   * Skeleton nötig, die Server Component liefert das Markup erst, wenn die Daten feststehen.
   */
  recentEntries: readonly Transaction[];
};

/** Wallet (§11): eigene Seite mobil, zweispaltig ab Tablet, Seitenpanel plus Historie auf Desktop. */
export function WalletPage({ recentEntries }: WalletPageProps) {
  return (
    <div className="anim-panel-in space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Wallet</h1>
        <p className="mt-1 text-sm text-muted">Demo-Guthaben verwalten. Jede Änderung wird als Transaktion protokolliert.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/*
          DemoWallet zeigt weiterhin den lokalen Wallet-Zustand (state/WalletContext.tsx) — der
          ist seit Auftrag Phase 3b beim Laden bereits mit dem Serverstand vorbelegt (siehe
          state/wallet-reducer.ts::applyServerWallet), zeigt also denselben Betrag. „Demo-Credits
          hinzufügen"/„Zurücksetzen" bleiben rein lokale Übergangsaktionen bis Phase 3c (siehe
          Kommentar in state/WalletContext.tsx) — dafür gibt es noch keinen Server-Endpunkt.
        */}
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
          <TransactionList transactions={recentEntries} hydrated sortBy="given" />
        </section>
      </div>
    </div>
  );
}
