"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Gift, Heart, History, Settings, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { useSession } from "@/state/SessionContext";
import { Skeleton } from "@/components/ui/Skeleton";
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
 * Zugriffsprüfung für den Nutzerbereich im Layout, nicht in jeder Seite (§7):
 * ohne Nutzer → /login?next=…; vor der Hydration Skeleton, nie ein Platzhalterwert.
 */
export function RequireUser({ children }: { children: ReactNode }) {
  const { hydrated, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hydrated && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, user, router, pathname]);

  if (!hydrated || !user) {
    return (
      <div className="grid gap-6 pt-6 md:grid-cols-[220px_1fr]" aria-busy="true">
        <Skeleton className="hidden h-72 md:block" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <span className="sr-only">Nutzerbereich wird geladen …</span>
      </div>
    );
  }

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
                  {active ? <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-px bg-gold md:inset-x-auto md:inset-y-2 md:left-0 md:h-auto md:w-px" /> : null}
                  <Icon className={cn("size-4", active && "text-gold")} aria-hidden="true" />
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
