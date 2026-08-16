import Link from "next/link";
import { ArrowRight, Play, ShieldCheck } from "lucide-react";
import { HERO_TEXT, PRODUCT_NAME, RG_NOTICE } from "@/lib/constants";
import { LinkButton } from "@/components/ui/Button";
import { HomeRows } from "@/components/home/HomeRows";
import { PromoCard } from "@/components/promotions/PromoCard";
import { promotions } from "@/data/promotions";

export default function HomePage() {
  return (
    <div className="space-y-12 pt-6 sm:pt-10">
      {/* Hero: ruhige Fläche, Signaturlinie, genau eine goldene Aktion */}
      <section aria-labelledby="hero-title" className="signature-top rounded-card border border-border-subtle bg-surface px-5 py-10 sm:px-10 sm:py-14">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-teal">Demo-Prototyp</p>
        <h1 id="hero-title" className="font-display measure text-2xl text-primary sm:text-3xl">
          {HERO_TEXT}
        </h1>
        <p className="measure mt-4 text-base text-muted">
          {PRODUCT_NAME} zeigt Lobby, Spielkarten, Demo-Wallet und einen vollständig spielbaren Slot — mit dokumentierter Zufallslogik und einsehbarer Auszahlungstabelle.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <LinkButton href="/game/neon-nights" variant="primary" size="lg" iconLeft={<Play className="size-4" aria-hidden="true" />}>
            Demo starten
          </LinkButton>
          <LinkButton href="/casino" variant="outline" size="lg" iconRight={<ArrowRight className="size-4" aria-hidden="true" />}>
            Spiele entdecken
          </LinkButton>
        </div>
        <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted">
          <ShieldCheck className="size-4 text-teal" aria-hidden="true" />
          Kein Echtgeldspiel. Keine Auszahlungen. Keine Einzahlungen.
        </p>
      </section>

      <HomeRows />

      <section aria-labelledby="promo-title" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <h2 id="promo-title" className="font-display text-lg text-primary sm:text-xl">
            Promotions
          </h2>
          <Link href="/promotions" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold transition-state hover:text-gold-strong">
            Alle ansehen
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {promotions.map((p) => (
            <li key={p.id}>
              <PromoCard promo={p} compact />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rg-title" className="rounded-card border border-teal/40 bg-surface p-5 sm:p-6">
        <h2 id="rg-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <ShieldCheck className="size-5 text-teal" aria-hidden="true" />
          Responsible Gaming
        </h2>
        <p className="measure mt-2 text-sm text-muted">{RG_NOTICE}</p>
        <LinkButton href="/responsible-gaming" variant="outline" className="mt-4">
          Spielzeit, Pause und Limits
        </LinkButton>
      </section>
    </div>
  );
}
