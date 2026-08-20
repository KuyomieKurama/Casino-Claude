"use client";

import { Heart } from "lucide-react";
import { useCatalog } from "@/state/CatalogContext";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

export type FavoriteButtonProps = {
  gameId: string;
  gameName: string;
  className?: string;
  size?: "sm" | "md";
};

/**
 * Favoriten-Herz mit 44×44-px-Ziel, aria-pressed und Skeleton vor der Hydration. Zustand nie
 * allein über Farbe: gefülltes vs. umrissenes Herz-Icon plus aria-pressed sind die beiden von
 * Farbe unabhängigen Signale, die Farbe kommt nur ergänzend hinzu. `press-feedback` (Auftrag
 * Etappe 3) ergänzt eine kurze, spürbare Reaktion auf den Tastendruck, wie auf den umgebenden
 * Spielkarten.
 */
export function FavoriteButton({ gameId, gameName, className, size = "sm" }: FavoriteButtonProps) {
  const { hydrated, isFavorite, toggleFavorite } = useCatalog();
  const active = hydrated && isFavorite(gameId);
  if (!hydrated) return <Skeleton className={cn("size-11 rounded-pill", className)} />;
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `${gameName} aus Favoriten entfernen` : `${gameName} zu Favoriten hinzufügen`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(gameId);
      }}
      className={cn(
        "press-feedback inline-flex size-11 items-center justify-center rounded-pill border transition-state",
        active ? "border-gold bg-base/80 text-gold" : "border-border-control bg-base/70 text-muted hover:border-gold hover:text-gold-strong",
        className,
      )}
    >
      <Heart className={cn(size === "sm" ? "size-4" : "size-5", active && "fill-current")} aria-hidden="true" />
    </button>
  );
}
