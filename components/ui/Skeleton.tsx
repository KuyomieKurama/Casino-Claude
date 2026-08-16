import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Skeleton mit stabilen Abmessungen — vor der Hydration wird nie ein Platzhalterwert
 * wie „1.000,00“ gezeigt (Konzept C7). Immer mit expliziter Breite/Höhe verwenden.
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("anim-skeleton rounded-control bg-elevated", className)} {...rest} />;
}

/** Textzeile in Zielgröße */
export function SkeletonText({ width = "8ch", className }: { width?: string; className?: string }) {
  return <Skeleton className={cn("inline-block h-[1em] align-middle", className)} style={{ width }} />;
}
