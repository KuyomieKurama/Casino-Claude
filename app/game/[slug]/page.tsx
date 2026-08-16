import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findGameBySlug, games } from "@/data/catalog";
import { GameDetail } from "@/components/game/GameDetail";
import { Skeleton } from "@/components/ui/Skeleton";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return games.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const game = findGameBySlug(slug);
  return { title: game ? `${game.name} – Demo` : "Spiel nicht gefunden" };
}

export default async function GamePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const game = findGameBySlug(slug);
  if (!game) notFound();
  return (
    <Suspense fallback={<div className="pt-6"><Skeleton className="aspect-[16/9] w-full max-w-3xl rounded-card" /></div>}>
      <GameDetail game={game} />
    </Suspense>
  );
}
