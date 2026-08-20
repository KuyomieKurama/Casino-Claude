"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, LayoutGrid, UserRound, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/casino", label: "Casino", icon: LayoutGrid },
  { href: "/favorites", label: "Favoriten", icon: Heart },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/profile", label: "Profil", icon: UserRound },
];

/**
 * Feste Bottom-Nav mit fünf Zielen bis 767 px, respektiert env(safe-area-inset-bottom).
 * Jedes Ziel ist mindestens 44 × 44 px. Glas mit deckendem Fallback, obere Haarlinie über
 * edge-light (Umgebungslicht) statt einer zusätzlichen Rahmenfarbe — passt zur Leitidee
 * "Der Tisch als Lichtquelle" und hält Gold weiterhin der einen Primär-Aktion pro Bildschirm
 * vorbehalten: das aktive Ziel markiert sich über den violetten Primärakzent, nicht über Gold.
 */
export function BottomNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Schnellnavigation"
      className="glass edge-light fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-[var(--bottom-nav-height)] grid-cols-5">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-state",
                  active ? "text-accent" : "text-muted hover:text-primary",
                )}
              >
                {active ? <span aria-hidden="true" className="absolute inset-x-4 top-0 h-px bg-accent-strong" /> : null}
                <Icon className="size-5" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
