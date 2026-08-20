"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type TabItem = { id: string; label: ReactNode; href?: string; count?: number };

export type TabsProps = {
  items: readonly TabItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  ariaLabel: string;
  className?: string;
};

/**
 * Horizontale, scrollbare Reiter. Mit `href` werden sie zu Links (URL-getriebene Filter →
 * aria-current), sonst zu Buttons mit role="tablist". Pfeiltasten wandern zwischen Reitern,
 * der aktive Reiter trägt die goldene Unterkante (Signatur).
 */
export function Tabs({ items, activeId, onSelect, ariaLabel, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const asLinks = items.every((i) => i.href);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    const focusables = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-tab]") ?? []);
    const idx = focusables.findIndex((el) => el === document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % focusables.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + focusables.length) % focusables.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = focusables.length - 1;
    focusables[next]?.focus();
    if (!asLinks) onSelect?.(items[next]?.id ?? activeId);
  };

  const itemClass = (active: boolean) =>
    cn(
      "relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-sm font-medium transition-state",
      active ? "text-primary" : "text-muted hover:text-primary",
    );

  // Violette Unterkante statt Gold: Gold bleibt der einen CTA-Fläche pro Bildschirm vorbehalten,
  // der aktive Reiter ist ein Systemzustand, kein Aufruf zur Handlung.
  const underline = (active: boolean) => (
    <span aria-hidden="true" className={cn("absolute inset-x-2 bottom-0 h-px", active ? "bg-accent-strong" : "bg-transparent")} />
  );

  return (
    <div
      ref={listRef}
      role={asLinks ? undefined : "tablist"}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("-mx-4 flex overflow-x-auto border-b border-border-subtle px-4 [scrollbar-width:thin] md:mx-0 md:px-0", className)}
    >
      {asLinks ? (
        <nav aria-label={ariaLabel} className="flex">
          {items.map((it) => {
            const active = it.id === activeId;
            return (
              <Link
                key={it.id}
                href={it.href ?? "#"}
                data-tab
                aria-current={active ? "page" : undefined}
                className={itemClass(active)}
                scroll={false}
              >
                {it.label}
                {typeof it.count === "number" ? <span className="tabular text-xs text-muted">({it.count})</span> : null}
                {underline(active)}
              </Link>
            );
          })}
        </nav>
      ) : (
        items.map((it) => {
          const active = it.id === activeId;
          return (
            <button
              key={it.id}
              type="button"
              role="tab"
              data-tab
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect?.(it.id)}
              className={itemClass(active)}
            >
              {it.label}
              {typeof it.count === "number" ? <span className="tabular text-xs text-muted">({it.count})</span> : null}
              {underline(active)}
            </button>
          );
        })
      )}
    </div>
  );
}
