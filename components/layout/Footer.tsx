import Link from "next/link";
import { PRODUCT_NAME, RG_NOTICE } from "@/lib/constants";

const columns = [
  {
    title: "Spielen",
    links: [
      { href: "/casino", label: "Casino-Lobby" },
      { href: "/live-casino", label: "Live-Casino-Demos" },
      { href: "/promotions", label: "Promotions" },
    ],
  },
  {
    title: "Schutz",
    links: [
      { href: "/responsible-gaming", label: "Responsible Gaming" },
      { href: "/help", label: "Hilfe & FAQ" },
    ],
  },
  {
    title: "Konto",
    links: [
      { href: "/login", label: "Anmelden" },
      { href: "/register", label: "Demo-Konto anlegen" },
      { href: "/settings", label: "Einstellungen" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border-subtle bg-surface pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] md:pb-8">
      <div className="mx-auto grid max-w-[1536px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-display text-lg text-primary">{PRODUCT_NAME}</p>
          <p className="measure text-sm text-muted">{RG_NOTICE}</p>
          <p className="text-xs text-muted">
            Keine Lizenzangaben, keine Zahlungsanbindung, keine Auszahlungen. Alle Spieltitel, Anbieter und Aktionen sind frei erfunden.
          </p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{col.title}</h2>
            <ul className="space-y-1">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-11 items-center text-sm text-primary transition-state hover:text-gold-strong">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
