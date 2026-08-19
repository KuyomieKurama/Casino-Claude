"use client";

import { useCatalog } from "@/state/CatalogContext";
import { GameGrid, GameGridSkeleton } from "./GameGrid";
import { AsyncBoundary } from "@/components/feedback/AsyncBoundary";

export function LiveGrid() {
  const { games, hydrated } = useCatalog();
  const live = games.filter((g) => g.isLiveDemo);
  return (
    <AsyncBoundary status={hydrated ? "ready" : "loading"} skeleton={<GameGridSkeleton count={3} />}>
      <GameGrid games={live} dense heading="Live-Tische" />
    </AsyncBoundary>
  );
}
