import type { Metadata } from "next";
import { getSession } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { resolveRecentLedgerEntries } from "@/server/wallet/ledger-history";
import { WalletPage } from "@/components/wallet/WalletPage";

export const metadata: Metadata = { title: "Wallet" };

/** Letzte Bewegungen auf der Wallet-Seite — fest, klein, keine Paginierung nötig (Auftrag §2). */
const RECENT_ENTRIES_LIMIT = 10;

/**
 * Server Component (Auftrag §1: "Server Component bevorzugt"): app/(user)/layout.tsx hat die
 * Sitzung bereits geprüft (Redirect nach /login ohne gültige Sitzung) — hier wird sie erneut
 * gelesen, weil NUR die geprüfte userId aus der Sitzung als Filterkriterium dienen darf, niemals
 * eine aus der Anfrage übernommene ID (Auftrag §3). Kein Route Handler nötig: reiner,
 * unmittelbarer Lesevorgang ohne Client-Interaktion — die Filter/Paginierung der vollständigen
 * Historie liegen auf /history (siehe dortige page.tsx), diese Seite zeigt nur einen festen
 * Ausschnitt.
 */
export default async function Page() {
  const session = await getSession();
  const recentEntries = await resolveRecentLedgerEntries(db, session?.user.id ?? null, RECENT_ENTRIES_LIMIT);
  return <WalletPage recentEntries={recentEntries} />;
}
