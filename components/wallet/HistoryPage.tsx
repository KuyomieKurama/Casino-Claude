"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@/state/WalletContext";
import { games } from "@/data/catalog";
import { Select } from "@/components/ui/Select";
import { TransactionList } from "./TransactionList";

type Range = "all" | "today" | "7d" | "30d";
type Sort = "newest" | "amount";

const rangeMs: Record<Exclude<Range, "all">, number> = { today: 24 * 3_600_000, "7d": 7 * 24 * 3_600_000, "30d": 30 * 24 * 3_600_000 };

/** Spielhistorie (§8.8): Filter nach Zeitraum und Spiel, Sortierung, Leerzustand. */
export function HistoryPage() {
  const { hydrated, transactions } = useWallet();
  const [range, setRange] = useState<Range>("all");
  const [gameId, setGameId] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const gameOptions = useMemo(() => {
    const ids = new Set(transactions.map((t) => t.gameId).filter((id): id is string => Boolean(id)));
    return [{ value: "", label: "Alle Spiele" }, ...games.filter((g) => ids.has(g.id)).map((g) => ({ value: g.id, label: g.name }))];
  }, [transactions]);

  const rows = useMemo(() => {
    const now = Date.now();
    let list = transactions.filter((t) => (range === "all" ? true : now - Date.parse(t.createdAt) <= rangeMs[range]));
    if (gameId) list = list.filter((t) => t.gameId === gameId);
    if (sort === "amount") list = [...list].sort((a, b) => Math.abs(b.amountMinor) - Math.abs(a.amountMinor));
    return list;
  }, [transactions, range, gameId, sort]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Spielhistorie</h1>
        <p className="mt-1 text-sm text-muted">Jede Bewegung mit Kontostand danach. Einsatz und Ergebnis derselben Runde teilen eine Runden-ID.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Zeitraum" value={range} onChange={(e) => setRange(e.target.value as Range)} options={[{ value: "all", label: "Gesamt" }, { value: "today", label: "Letzte 24 Stunden" }, { value: "7d", label: "Letzte 7 Tage" }, { value: "30d", label: "Letzte 30 Tage" }]} />
        <Select label="Spiel" value={gameId} onChange={(e) => setGameId(e.target.value)} options={gameOptions} />
        <Select label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={[{ value: "newest", label: "Neueste zuerst" }, { value: "amount", label: "Größter Betrag zuerst" }]} />
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {hydrated ? `${rows.length} ${rows.length === 1 ? "Buchung" : "Buchungen"}` : null}
      </p>
      <TransactionList transactions={rows} hydrated={hydrated} sortBy={sort === "amount" ? "given" : "seq"} />
    </div>
  );
}
