"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, Heart, History, Settings, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

const userNav = [
  { href: "/profile", label: "Übersicht", icon: UserRound },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/history", label: "Historie", icon: History },
  { href: "/favorites", label: "Favoriten", icon: Heart },
  { href: "/bonuses", label: "Boni", icon: Gift },
  { href: "/security", label: "Sicherheit", icon: ShieldCheck },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

/**
 * Navigationshülle für den Nutzerbereich. Die Zugriffsprüfung selbst läuft davor, serverseitig
 * in app/(user)/layout.tsx (requireUser über server/auth/guards.ts) — diese Komponente zeigt
 * nur noch die Seitennavigation und rendert die Kindelemente. Kein Gating, kein Hydration-
 * Skeleton mehr nötig: Wer hier ankommt, ist bereits als angemeldet bestätigt, bevor überhaupt
 * gerendert wird (vormals components/layout/RequireUser.tsx).
 */
export function UserShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-6 pt-6 md:grid-cols-[220px_1fr]">
      <nav aria-label="Nutzerbereich" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1 md:flex-col">
          {userNav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-11 items-center gap-2 rounded-control px-3 text-sm font-medium transition-state",
                    active ? "bg-surface text-primary" : "text-muted hover:bg-surface hover:text-primary",
                  )}
                >
                  {/* Kontoverwaltung bleibt bewusst golden: Gold ist dem Spiel vorbehalten (§4).
                      Der aktive Zustand markiert sich über Fläche, Text und diese Teal-Kante. */}
                  {active ? <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-px bg-teal md:inset-x-auto md:inset-y-2 md:left-0 md:h-auto md:w-px" /> : null}
                  <Icon className={cn("size-4", active && "text-teal")} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
