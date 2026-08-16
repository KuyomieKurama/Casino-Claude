import Link from "next/link";
import { Gift } from "lucide-react";
import type { Promotion } from "@/data/promotions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const statusLabel: Record<Promotion["status"], { label: string; tone: "teal" | "neutral" | "warning" }> = {
  active: { label: "Aktiv (Demo)", tone: "teal" },
  upcoming: { label: "Demnächst (Mock)", tone: "neutral" },
  expired: { label: "Beendet (Mock)", tone: "warning" },
};

/** Promotions-Karte als UI-Muster (§8.10). Keine Bedingungen, keine Verknappung, kein Countdown. */
export function PromoCard({ promo, className, compact }: { promo: Promotion; className?: string; compact?: boolean }) {
  const s = statusLabel[promo.status];
  return (
    <Card as="article" className={cn("flex h-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <Badge tone={s.tone}>{s.label}</Badge>
        <Gift className="size-5 text-gold" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg text-primary">{promo.title}</h3>
      <p className={cn("text-sm text-muted", compact && "line-clamp-2")}>{promo.description}</p>
      <dl className="mt-auto space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Demo-Belohnung</dt>
          <dd className="text-right font-medium text-primary">{promo.rewardLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Gültigkeit</dt>
          <dd className="text-right text-primary/90">{promo.validUntilLabel}</dd>
        </div>
      </dl>
      <Link href={`/promotions#${promo.slug}`} className="inline-flex min-h-11 items-center text-sm font-medium text-gold transition-state hover:text-gold-strong">
        Details ansehen
      </Link>
    </Card>
  );
}
