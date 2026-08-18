"use client";

import Link from "next/link";
import { PRODUCT_NAME, RG_NOTICE } from "@/lib/constants";
import { useSession } from "@/state/SessionContext";
import { useLogout } from "@/components/auth/useLogout";

const playColumn = {
  title: "Spielen",
  links: [
    { href: "/casino", label: "Casino-Lobby" },
    { href: "/live-casino", label: "Live-Casino-Demos" },
    { href: "/promotions", label: "Promotions" },
  ],
};

const protectionColumn = {
  title: "Schutz",
  links: [
    { href: "/responsible-gaming", label: "Responsible Gaming" },
    { href: "/help", label: "Hilfe & FAQ" },
  ],
};

const linkClass = "inline-flex min-h-11 items-center text-sm text-primary transition-state hover:text-gold-strong";

/**
 * Der Fußzeilen-Bereich „Konto" spiegelt den Anmeldezustand (Auftrag §1): angemeldet zeigt er
 * Nutzerbereich/Einstellungen/Abmelden statt Anmelden/Registrieren — dieselbe Unterscheidung wie
 * im Header, hier zusätzlich als vollständig auflistbarer Fallback ohne Menü-Interaktion.
 */
export function Footer() {
  const { user } = useSession();
  const logout = useLogout();

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

        <nav aria-label={playColumn.title}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{playColumn.title}</h2>
          <ul className="space-y-1">
            {playColumn.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={protectionColumn.title}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{protectionColumn.title}</h2>
          <ul className="space-y-1">
            {protectionColumn.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Konto">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Konto</h2>
          <ul className="space-y-1">
            {user ? (
              <>
                <li>
                  <Link href="/profile" className={linkClass}>
                    Nutzerbereich
                  </Link>
                </li>
                <li>
                  <Link href="/settings" className={linkClass}>
                    Einstellungen
                  </Link>
                </li>
                {user.role === "admin" ? (
                  <li>
                    <Link href="/admin" className={linkClass}>
                      Admin-Bereich
                    </Link>
                  </li>
                ) : null}
                <li>
                  <button type="button" onClick={() => void logout()} className={`${linkClass} w-full text-left`}>
                    Abmelden
                  </button>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link href="/login" className={linkClass}>
                    Anmelden
                  </Link>
                </li>
                <li>
                  <Link href="/register" className={linkClass}>
                    Demo-Konto anlegen
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
