"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/admin", label: "Systemstatus" },
  { href: "/admin/users", label: "Nutzer" },
  { href: "/admin/games", label: "Spiele" },
  { href: "/admin/audit-log", label: "Audit-Log" },
] as const;

/**
 * Eigene, ruhigere Kopfzeile für den gesamten Admin-Bereich (Admin-Auftrag „Gestaltung"): klar
 * vom Nutzerbereich unterscheidbar, KEIN Gold — Gold gehört laut Auftrag dem Spielbereich (siehe
 * CLAUDE.md: Gold ist knapp, belegt vom Start-Button). Der aktive Navigationspunkt hebt sich
 * ausschließlich über Hintergrundfläche und `aria-current`, nicht über Farbe allein (§12).
 */
export function AdminHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">Admin-Bereich</p>
        <nav aria-label="Admin-Navigation">
          <ul className="flex flex-wrap gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium transition-state",
                      isActive ? "bg-elevated text-primary" : "text-muted hover:text-primary",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
