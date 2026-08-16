import { Suspense } from "react";
import type { Metadata } from "next";
import { Lobby } from "@/components/game/Lobby";
import { GameGridSkeleton } from "@/components/game/GameGrid";

export const metadata: Metadata = { title: "Casino-Lobby" };

export default function CasinoPage() {
  return (
    <Suspense fallback={<div className="pt-6"><GameGridSkeleton /></div>}>
      <Lobby />
    </Suspense>
  );
}
