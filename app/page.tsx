import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { RG_NOTICE } from "@/lib/constants";
import { LinkButton } from "@/components/ui/Button";
import { Hero } from "@/components/home/Hero";
import { HomeRows } from "@/components/home/HomeRows";
import { PromoCard } from "@/components/promotions/PromoCard";
import { promotions } from "@/data/promotions";

/**
 * Startseite: Der Hero (components/home/Hero.tsx) ist jetzt das stärkste Element der Seite und
 * trägt die eine goldene Fläche des Bildschirms (primärer CTA). Das ist eine bewusste Revision
 * der vorigen Entscheidung — bis hierher hatte der Einstieg absichtlich keinen eigenen
 * goldenen Button, damit diese Fläche allein der hervorgehobenen Spielkarte in HomeRows
 * gehörte. Die Karte dort verzichtet seit dieser Revision auf ihren goldenen Button (siehe
 * Kommentar in components/home/HomeRows.tsx), damit weiterhin höchstens eine goldene Fläche
 * pro Bildschirm entsteht ("Gold bleibt knapp").
 */
export default function HomePage() {
  return (
    <div className="space-y-2xl pt-4 sm:space-y-3xl sm:pt-6">
      <Hero />

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

      <section aria-labelledby="rg-title" className="edge-light rounded-card border border-accent/40 bg-surface p-5 sm:p-6">
        <h2 id="rg-title" className="font-display flex items-center gap-2 text-md text-primary">
          <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
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
