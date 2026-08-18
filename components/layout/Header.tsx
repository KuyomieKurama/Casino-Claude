"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogIn, LogOut, Menu, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { BalanceDisplay } from "@/components/wallet/BalanceDisplay";
import { SessionTimer } from "@/components/rg/SessionTimer";
import { SoundToggle } from "@/components/sound/SoundToggle";
import { useSession } from "@/state/SessionContext";
import { useLogout } from "@/components/auth/useLogout";
import { cn } from "@/lib/cn";

export const PRIMARY_NAV = [
  { href: "/casino", label: "Casino" },
  { href: "/live-casino", label: "Live-Casino" },
  { href: "/promotions", label: "Promotions" },
  { href: "/responsible-gaming", label: "Responsible Gaming" },
  { href: "/help", label: "Hilfe" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Kopfzeile mit Signaturlinie unten, Glas-Hintergrund mit deckendem Fallback.
 *
 * Breakpoint-Entscheidung: Die volle Textnavigation samt Kontobereich erscheint erst ab `lg`
 * (1024 px) statt wie zuvor ab `md` (768 px) — darunter reicht die Breite nicht für fünf
 * Navigationspunkte, Guthaben, Sitzungsdauer und Kontosteuerung, ohne dass etwas umbricht oder
 * abgeschnitten wird (Auftrag §4, „stabile Abmessungen“). Bis `lg` übernimmt ein Menü-Knopf, der
 * MobileMenu öffnet; dieselben Ziele bleiben damit auch im Tablet-Bereich (768–1023 px) ohne
 * horizontales Scrollen erreichbar. Responsible Gaming bleibt zusätzlich als eigenes Icon
 * erreichbar, solange die Textnavigation verborgen ist (Pflicht laut ENGINE-BRIEF.md).
 */
export function Header() {
  const pathname = usePathname();
  // Kommt bereits serverseitig feststehend an (app/layout.tsx → server/auth/guards.ts) — kein
  // Hydration-Skeleton mehr nötig, der erste gerenderte Markup zeigt bereits den echten Zustand.
  const { user } = useSession();
  const logout = useLogout();
  const isAdmin = user?.role === "admin";
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="glass signature-bottom sticky top-[var(--demo-stripe-height)] z-40 h-[var(--header-height)]">
      <div className="mx-auto flex h-full max-w-[1536px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <span className="sm:hidden">
          <Logo compact />
        </span>
        <span className="hidden sm:block">
          <Logo />
        </span>

        <nav aria-label="Hauptnavigation" className="ml-2 hidden items-center gap-0.5 lg:ml-4 lg:flex lg:gap-1">
          {PRIMARY_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 items-center whitespace-nowrap rounded-control px-3 text-sm font-medium transition-state",
                  active ? "text-primary" : "text-muted hover:text-primary",
                )}
              >
                {item.label}
                {active ? <span aria-hidden="true" className="absolute inset-x-3 -bottom-[11px] h-px bg-gold" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <SessionTimer variant="compact" className="hidden xl:inline-flex" />
          <BalanceDisplay variant="header" />
          {/* Kompakter Ton-Umschalter: unabhängig vom Anmeldezustand erreichbar, keine
              Nutzergeste beim Laden — die Klang-Erzeugung startet erst beim ersten Klang. */}
          <SoundToggle />
          {isAdmin ? (
            <Link
              href="/admin"
              aria-current={isActivePath(pathname, "/admin") ? "page" : undefined}
              aria-label="Admin-Bereich"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-state hover:bg-surface hover:text-primary"
            >
              <LayoutDashboard className="size-5" aria-hidden="true" />
            </Link>
          ) : null}

          {/* Ab lg vollständige Kontosteuerung; darunter übernimmt MobileMenu dieselben Ziele. */}
          <div className="hidden items-center gap-1.5 lg:flex">
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="inline-flex h-11 items-center gap-2 rounded-control border border-border-subtle px-3 text-sm font-medium text-primary transition-state hover:border-gold"
                >
                  <UserRound className="size-4 text-teal" aria-hidden="true" />
                  <span className="max-w-[12ch] truncate">{user.displayName}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  aria-label="Abmelden"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-state hover:bg-surface hover:text-primary"
                >
                  <LogOut className="size-5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center gap-2 rounded-control border border-border-control px-3 text-sm font-medium text-primary transition-state hover:border-gold"
                >
                  <LogIn className="size-4" aria-hidden="true" />
                  Anmelden
                </Link>
                <Link href="/register" className="inline-flex h-11 items-center px-2 text-sm font-medium text-muted transition-state hover:text-primary">
                  Registrieren
                </Link>
              </>
            )}
          </div>

          <Link
            href="/responsible-gaming"
            aria-label="Responsible Gaming"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-teal transition-state hover:bg-surface lg:hidden"
          >
            <ShieldCheck className="size-5" aria-hidden="true" />
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            aria-label="Menü öffnen"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-primary transition-state hover:bg-surface lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={menuButtonRef} title="Menü" id={menuId}>
        <div className="space-y-1 border-b border-border-subtle pb-4">
          {user ? (
            <>
              <p className="px-2 pb-2 text-sm text-muted">
                Angemeldet als <span className="font-medium text-primary">{user.displayName}</span>
              </p>
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-primary transition-state hover:bg-surface"
              >
                <UserRound className="size-4 text-teal" aria-hidden="true" />
                Nutzerbereich
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="flex h-11 w-full items-center gap-2 rounded-control px-2 text-left text-sm font-medium text-primary transition-state hover:bg-surface"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Abmelden
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-primary transition-state hover:bg-surface"
              >
                <LogIn className="size-4" aria-hidden="true" />
                Anmelden
              </Link>
              <Link
                href="/register"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-primary transition-state hover:bg-surface"
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Registrieren
              </Link>
            </>
          )}
        </div>

        <nav aria-label="Menü" className="space-y-1 py-3">
          {PRIMARY_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-2 rounded-control px-2 text-sm font-medium transition-state",
                  active ? "bg-surface text-primary" : "text-muted hover:bg-surface hover:text-primary",
                )}
              >
                {active ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-px bg-gold" /> : null}
                {item.label === "Responsible Gaming" ? <ShieldCheck className="size-4 text-teal" aria-hidden="true" /> : null}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {isAdmin ? (
          <div className="border-t border-border-subtle pt-3">
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              aria-current={isActivePath(pathname, "/admin") ? "page" : undefined}
              className="flex h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-muted transition-state hover:bg-surface hover:text-primary"
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              Admin-Bereich
            </Link>
          </div>
        ) : null}
      </MobileMenu>
    </header>
  );
}
