import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { HERO_TEXT, RG_NOTICE } from "@/lib/constants";
import { LinkButton } from "@/components/ui/Button";
import { HomeRows } from "@/components/home/HomeRows";
import { PromoCard } from "@/components/promotions/PromoCard";
import { promotions } from "@/data/promotions";

/**
 * Startseite: Der Einstieg bleibt bewusst schmal (drei Zeilen, keine eigene goldene Aktion),
 * damit das hervorgehobene Spiel in HomeRows — mit der einen goldenen Fläche des Bildschirms
 * ("Spielen") — bereits im ersten sichtbaren Bereich steht, statt von einer zusätzlichen
 * Marketingfläche nach unten verdrängt zu werden (Auftrag §2). Ein zweiter goldener Button
 * hier würde nur die Aktion der Spielkarte duplizieren, deshalb bleibt er weg.
 */
export default function HomePage() {
  return (
    <div className="space-y-xl pt-4 sm:space-y-2xl sm:pt-6">
      <section aria-labelledby="hero-title">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal">Spielwährung ohne Geldwert</p>
        <h1 id="hero-title" className="font-display measure mt-2 text-xl text-primary sm:text-2xl">
          {HERO_TEXT}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="inline-flex items-center gap-2 text-sm text-muted">
            <ShieldCheck className="size-4 shrink-0 text-teal" aria-hidden="true" />
            Kein Echtgeldspiel. Keine Auszahlungen. Keine Einzahlungen.
          </p>
          <Link href="/casino" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold transition-state hover:text-gold-strong">
            Alle Spiele entdecken
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
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

      <section aria-labelledby="rg-title" className="edge-light rounded-card border border-teal/40 bg-surface p-5 sm:p-6">
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
