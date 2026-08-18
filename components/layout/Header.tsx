"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, ShieldCheck, UserRound } from "lucide-react";
import { Logo } from "./Logo";
import { BalanceDisplay } from "@/components/wallet/BalanceDisplay";
import { SessionTimer } from "@/components/rg/SessionTimer";
import { useSession } from "@/state/SessionContext";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/casino", label: "Casino" },
  { href: "/live-casino", label: "Live-Casino" },
  { href: "/promotions", label: "Promotions" },
  { href: "/responsible-gaming", label: "Responsible Gaming" },
  { href: "/help", label: "Hilfe" },
];

/**
 * Header mit Signaturlinie unten, Glas-Hintergrund mit deckendem Fallback.
 * Auf Mobil: Logo, Guthaben, Konto. Ab md: volle Navigation.
 */
export function Header() {
  const pathname = usePathname();
  // Kommt bereits serverseitig feststehend an (app/layout.tsx → server/auth/guards.ts) — kein
  // Hydration-Skeleton mehr nötig, der erste gerenderte Markup zeigt bereits den echten Zustand.
  const { user } = useSession();

  return (
    <header className="glass signature-bottom sticky top-[var(--demo-stripe-height)] z-40 h-[var(--header-height)]">
      <div className="mx-auto flex h-full max-w-[1536px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <span className="sm:hidden">
          <Logo compact />
        </span>
        <span className="hidden sm:block">
          <Logo />
        </span>

        <nav aria-label="Hauptnavigation" className="ml-2 hidden items-center gap-0.5 lg:ml-4 lg:gap-1 md:flex">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
          <SessionTimer variant="compact" className="hidden lg:inline-flex" />
          <BalanceDisplay variant="header" />
          {user ? (
            <Link
              href="/profile"
              className="hidden h-11 items-center gap-2 rounded-control border border-border-subtle px-3 text-sm font-medium text-primary transition-state hover:border-gold md:inline-flex"
            >
              <UserRound className="size-4 text-teal" aria-hidden="true" />
              <span className="max-w-[12ch] truncate">{user.displayName}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="hidden h-11 items-center gap-2 rounded-control border border-border-control px-3 text-sm font-medium text-primary transition-state hover:border-gold md:inline-flex"
            >
              <LogIn className="size-4" aria-hidden="true" />
              Anmelden
            </Link>
          )}
          <Link
            href="/responsible-gaming"
            aria-label="Responsible Gaming"
            className="inline-flex size-11 items-center justify-center rounded-control text-teal transition-state hover:bg-surface md:hidden"
          >
            <ShieldCheck className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
