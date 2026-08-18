import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Game } from "@/types/game";
import { findGameById } from "@/data/catalog";
import { findGameBySlug, games } from "@/data/games";
import { GameDetail } from "@/components/game/GameDetail";
import { Skeleton } from "@/components/ui/Skeleton";
import { db } from "@/server/db/client";
import { loadGameModeDetail } from "@/server/catalog/read-model";

type Params = { slug: string };

/**
 * Bewusst aus data/games.ts (nicht aus der Datenbank): generateStaticParams läuft zur Bauzeit,
 * eine DB-Abfrage wäre dort ein neuer, vermeidbarer Build-Zeit-Zugriff (Auftrag §1). Die
 * eigentlichen Seiteninhalte kommen trotzdem aus der Datenbank, siehe GamePage unten — die
 * Routenliste (welche Slugs existieren) und der Seiteninhalt (was auf der Seite steht) sind
 * zwei getrennte Fragen.
 */
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
  // Slug → Modus-ID: game_mode trägt keinen eigenen Slug (siehe server/db/schema.ts), die
  // Zuordnung bleibt deshalb bei data/games.ts (identisch zur Routenliste oben).
  const routeGame = findGameBySlug(slug);
  if (!routeGame) notFound();

  const detail = await loadGameModeDetail(db, routeGame.id);
  if (!detail) notFound();

  // Basis mit abgeleitetem RTP aus data/catalog.ts (unantastbar, siehe Auftrag) — Status und
  // Einsatzgrenzen kommen dagegen vom geladenen Modus aus der Datenbank (Auftrag §3), da
  // `game_mode` dafür je Modus authoritativ ist (siehe server/catalog/read-model.ts).
  const presentation = findGameById(routeGame.id);
  if (!presentation) notFound();
  const game: Game = {
    ...presentation,
    status: detail.mode.status,
    minDemoBetMinor: detail.mode.minBetMinor,
    maxDemoBetMinor: detail.mode.maxBetMinor,
  };

  return (
    <Suspense fallback={<div className="pt-6"><Skeleton className="aspect-[16/9] w-full max-w-3xl rounded-card" /></div>}>
      <GameDetail game={game} siblingModes={detail.siblings} titleLabel={detail.title.name} />
    </Suspense>
  );
}
