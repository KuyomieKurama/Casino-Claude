"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { GameEngineViewProps } from "@/types/engine";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Zuordnung Spiel → Engine-Oberfläche. Jede Engine wird lazy geladen, damit die Lobby nicht
 * den Code aller Spiele mitträgt. Diese Datei ist die EINZIGE Stelle, an der Engines
 * registriert werden — Engines selbst kennen die Registry nicht.
 */

const loading = () => <Skeleton className="h-[420px] w-full rounded-card" />;

const SlotGame = dynamic(() => import("../slot/SlotGame").then((m) => m.SlotGame), { loading, ssr: false });
const RouletteGame = dynamic(() => import("./roulette/RouletteGame").then((m) => m.RouletteGame), { loading, ssr: false });
const BlackjackGame = dynamic(() => import("./blackjack/BlackjackGame").then((m) => m.BlackjackGame), { loading, ssr: false });
const BaccaratGame = dynamic(() => import("./baccarat/BaccaratGame").then((m) => m.BaccaratGame), { loading, ssr: false });
const VideoPokerGame = dynamic(() => import("./videopoker/VideoPokerGame").then((m) => m.VideoPokerGame), { loading, ssr: false });
const PlinkoGame = dynamic(() => import("./arcade/PlinkoGame").then((m) => m.PlinkoGame), { loading, ssr: false });
const MinesGame = dynamic(() => import("./arcade/MinesGame").then((m) => m.MinesGame), { loading, ssr: false });
const DiceGame = dynamic(() => import("./arcade/DiceGame").then((m) => m.DiceGame), { loading, ssr: false });
const WheelGame = dynamic(() => import("./arcade/WheelGame").then((m) => m.WheelGame), { loading, ssr: false });

/** Spiel-ID → Oberfläche. Fehlt ein Eintrag, ist das Spiel nicht spielbar (Detailseite zeigt das an). */
export const ENGINE_BY_GAME_ID: Record<string, ComponentType<GameEngineViewProps>> = {
  // Slots — alle über dieselbe Slot-Engine, unterschieden durch Auszahlungstabelle und Symbolsatz
  "g-classic-fruit": SlotGame,
  "g-neon-nights": SlotGame,
  "g-kupferschacht": SlotGame,
  "g-codex-aurelia": SlotGame,
  "g-salzwind": SlotGame,
  "g-sandkoenigin": SlotGame,
  "g-mystic-jungle": SlotGame,
  "g-luxury-7s": SlotGame,
  "g-staubpfad": SlotGame,
  "g-zunderschuppe": SlotGame,
  "g-lunara-drift": SlotGame,
  // Tischspiele
  "g-european-roulette": RouletteGame,
  "g-american-roulette": RouletteGame,
  "g-classic-blackjack": BlackjackGame,
  "g-vip-blackjack": BlackjackGame,
  "g-baccarat": BaccaratGame,
  "g-video-poker": VideoPokerGame,
  // Arcade und Game Shows
  "g-plinko-demo": PlinkoGame,
  "g-mines-demo": MinesGame,
  "g-dice-demo": DiceGame,
  "g-wheel-demo": WheelGame,
  // Live-Demos — dieselbe Fachlogik wie die Tischspiele, eigene Live-Darstellung
  "g-live-roulette-demo": RouletteGame,
  "g-live-blackjack-demo": BlackjackGame,
  "g-live-baccarat-demo": BaccaratGame,
};

export function engineFor(gameId: string): ComponentType<GameEngineViewProps> | undefined {
  return ENGINE_BY_GAME_ID[gameId];
}
