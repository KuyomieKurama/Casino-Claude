"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Coins, Dices, Heart, LogOut, ShieldCheck, TrendingUp } from "lucide-react";
import { useSession } from "@/state/SessionContext";
import { useLogout } from "@/components/auth/useLogout";
import { useWallet } from "@/state/WalletContext";
import { useCatalog } from "@/state/CatalogContext";
import { useRgStatus } from "@/state/RgContext";
import { availableMinor } from "@/state/wallet-reducer";
import { rgReasonText } from "@/state/rg-reducer";
import { games } from "@/data/catalog";
import { formatCredits, formatCreditsSigned, formatDuration } from "@/lib/formatters";
import { Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { DemoBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { GameCard } from "@/components/game/GameCard";
import { TransactionList } from "@/components/wallet/TransactionList";
import { cn } from "@/lib/cn";

/** Dashboard (§8.8): Guthaben, gespielte Runden, Favoritenzahl, Nettostatistik, zuletzt gespielt, RG-Kurzstatus. */
export function Dashboard() {
  const { user } = useSession();
  const logout = useLogout();
  const { wallet, transactions, hydrated } = useWallet();
  const { favorites } = useCatalog();
  const rg = useRgStatus(5000);
  const { toast } = useToast();

  const stats = useMemo(() => {
    const bets = transactions.filter((t) => t.type === "demo_bet" || t.type === "free_spin");
    const wins = transactions.filter((t) => t.type === "demo_win");
    const staked = bets.reduce((s, t) => s + Math.abs(t.amountMinor), 0);
    const returned = wins.reduce((s, t) => s + t.amountMinor, 0);
    const lastGameId = [...transactions].sort((a, b) => b.seq - a.seq).find((t) => t.gameId)?.gameId;
    return { rounds: bets.length, staked, returned, net: returned - staked, lastGame: games.find((g) => g.id === lastGameId) };
  }, [transactions]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-primary sm:text-3xl">Hallo, {user.displayName}</h1>
          <p className="mt-1 text-sm text-muted">{user.email}</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            toast({ tone: "info", title: "Abgemeldet.", description: "Demo-Guthaben und Favoriten bleiben auf diesem Gerät erhalten." });
            await logout("/");
          }}
          iconLeft={<LogOut className="size-4" aria-hidden="true" />}
        >
          Abmelden
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Coins className="size-5 text-gold" aria-hidden="true" />} label="Demo-Guthaben" value={hydrated ? `${formatCredits(availableMinor(wallet))} Credits` : "…"} badge />
        <Stat icon={<Dices className="size-5 text-teal" aria-hidden="true" />} label="Gespielte Runden" value={hydrated ? String(stats.rounds) : "…"} />
        <Stat icon={<Heart className="size-5 text-teal" aria-hidden="true" />} label="Favoriten" value={String(favorites.length)} />
        <Stat
          icon={<TrendingUp className="size-5 text-teal" aria-hidden="true" />}
          label="Netto (Rückgabe − Einsatz)"
          value={hydrated ? `${formatCreditsSigned(stats.net)} Credits` : "…"}
          valueClass={stats.net > 0 ? "text-success" : "text-primary"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="recent-title" className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 id="recent-title" className="text-md font-semibold text-primary">
              Letzte Bewegungen
            </h2>
            <Link href="/history" className="text-sm font-medium text-gold hover:text-gold-strong">
              Gesamte Historie
            </Link>
          </div>
          <TransactionList transactions={transactions} hydrated={hydrated} limit={6} />
        </section>
        <div className="space-y-6">
          <Card as="section" aria-labelledby="rg-short" className="space-y-2 border-teal/40">
            <h2 id="rg-short" className="flex items-center gap-2 text-md font-semibold text-primary">
              <ShieldCheck className="size-5 text-teal" aria-hidden="true" /> Responsible Gaming
            </h2>
            <p className="text-sm text-muted">
              {rg.hydrated
                ? rg.blocked && rg.reason
                  ? rgReasonText[rg.reason].title
                  : `Aktuelle Spielzeit: ${formatDuration(rg.sessionElapsedMs)}`
                : "…"}
            </p>
            <LinkButton href="/responsible-gaming" variant="outline" size="sm" className="self-start">
              Zum Bereich
            </LinkButton>
          </Card>
          {stats.lastGame ? (
            <section aria-labelledby="last-title" className="space-y-2">
              <h2 id="last-title" className="text-md font-semibold text-primary">
                Zuletzt gespielt
              </h2>
              <GameCard game={stats.lastGame} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, badge, valueClass }: { icon: React.ReactNode; label: string; value: string; badge?: boolean; valueClass?: string }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("tabular text-xl font-semibold", valueClass ?? "text-primary")}>{value}</span>
        {badge ? <DemoBadge /> : null}
      </div>
    </Card>
  );
}
