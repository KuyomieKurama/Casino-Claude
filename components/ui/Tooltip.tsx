"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Einfacher Tooltip: erscheint bei Hover und Tastaturfokus, ist über aria-describedby
 * verknüpft. Kein wesentlicher Inhalt gehört ausschließlich hierher.
 */
export function Tooltip({ content, children, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-max max-w-[16rem] -translate-x-1/2 rounded-control border border-border-subtle bg-elevated px-2.5 py-1.5 text-xs text-primary shadow-1 transition-fade",
          open ? "opacity-100" : "opacity-0",
        )}
        aria-hidden={!open}
      >
        {content}
      </span>
    </span>
  );
}
