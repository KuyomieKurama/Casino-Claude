import { ArrowRight, Coins, LifeBuoy, Percent, ShieldCheck, UserPlus } from "lucide-react";
import { HERO_TEXT } from "@/lib/constants";
import { LinkButton } from "@/components/ui/Button";
import { HeroObject } from "./HeroObject";

type TrustItem = {
  icon: typeof ShieldCheck;
  text: string;
};

/** Ausschließlich belegbare Aussagen (Auftrag §2) — keine Lizenzen, Siegel oder Versprechen. */
const TRUST_ITEMS: readonly TrustItem[] = [
  { icon: ShieldCheck, text: "Kein Echtgeldspiel. Keine Ein- oder Auszahlungen." },
  { icon: Coins, text: "10.000 Credits Startguthaben bei der Kontoanlage." },
  { icon: LifeBuoy, text: "Spielerschutz-Werkzeuge: Spielzeit, Pause, Limits." },
  { icon: Percent, text: "RTP-Werte nachvollziehbar aus den Auszahlungstabellen." },
];

/**
 * Hero-Sektion der Startseite — das stärkste Element der gesamten Website (Auftrag „Ziel").
 * Trägt jetzt die eine goldene Fläche des Bildschirms (primärer CTA): eine bewusste Revision
 * der vorigen Entscheidung (siehe Kommentar-Historie in app/page.tsx), die die goldene Fläche
 * bisher der featured-Karte in HomeRows vorbehalten hatte. Die Karte dort verzichtet im
 * Gegenzug auf ihren goldenen Button (siehe components/home/HomeRows.tsx).
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate">
      <div className="grid items-center gap-2xl lg:grid-cols-[1.05fr_0.95fr] lg:gap-3xl">
        {/* stagger-list (app/globals.css): jedes direkte Kind tritt zeitversetzt ein, die
            Reihenfolge im Markup ist zugleich die Lesereihenfolge. */}
        <div className="stagger-list space-y-lg">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Spielwährung ohne Geldwert</p>
          <h1 id="hero-title" className="font-display measure text-hero text-primary">
            {HERO_TEXT}
          </h1>
          <p className="measure text-md text-muted sm:text-lg">
            24 Spieltitel über sieben Engine-Familien, 23 davon spielbar — jeweils mit offener Auszahlungstabelle statt
            Gewinnversprechen.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <LinkButton
              href="/casino"
              variant="primary"
              size="lg"
              iconRight={<ArrowRight className="size-4" aria-hidden="true" />}
              className="w-full sm:w-auto"
            >
              Jetzt spielen
            </LinkButton>
            {/* variant="outline" ist die glasartige, zurückhaltende Fläche (components/ui/Button.tsx:
                .glass-panel, violetter statt goldener Hover) — Gold bleibt dem primären CTA
                vorbehalten. */}
            <LinkButton
              href="/register"
              variant="outline"
              size="lg"
              iconLeft={<UserPlus className="size-4" aria-hidden="true" />}
              className="w-full sm:w-auto"
            >
              Konto erstellen
            </LinkButton>
          </div>
          <ul className="grid gap-x-5 gap-y-2 pt-2 sm:grid-cols-2">
            {TRUST_ITEMS.map((item) => (
              <li key={item.text} className="flex items-start gap-2 text-sm text-muted">
                <item.icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden lg:block">
          <HeroObject />
        </div>
      </div>
    </section>
  );
}
