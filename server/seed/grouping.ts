import { hasPaytable } from "@/data/catalog";
import { findGameById } from "@/data/games";
import type { EngineKey, GameModeKind } from "@/server/db/enums";

/**
 * Explizite Titel/Modus-Gruppierung — Kern der Migration von der heutigen flachen
 * `Game`-Liste (data/games.ts, 24 Einträge) auf `game` (Titel) + `game_mode` (Modus).
 *
 * NICHT geraten, nicht über Namensähnlichkeit — verifiziert gegen data/paytables/*:
 *
 *  - Roulette (European/American/Live): Live teilt exakt die Paytables von European
 *    (data/paytables/roulette.ts, `tablesFor("g-live-roulette-demo", 37)` nutzt dieselben
 *    BET_SPECS wie European), hat aber eine eigene Tabelle unter eigener Spiel-ID —
 *    deshalb `kind: "presentation"`, nicht `"variant"`. American hat einen echten
 *    Regelunterschied (Doppelnull, andere Auszahlungsquote) → `"variant"`.
 *  - Blackjack (Classic/VIP/Live): identische Regeln — es gibt in data/paytables/ ohnehin
 *    keine blackjack.ts (Regel 6: strategieabhängiger Erwartungswert, keine Tabelle). VIP
 *    ist in data/games.ts wörtlich als "Reine Präsentationsvariante" beschrieben (nur
 *    höhere Einsatzgrenzen, kein Regelunterschied) → `"presentation"`.
 *  - Baccarat (Standard/Live): identische Paytables (data/paytables/baccarat.ts,
 *    `BACCARAT_GAME_IDS = ["g-baccarat", "g-live-baccarat-demo"]` erzeugt für beide
 *    dieselben player-/banker-/tie-Einträge) → Live ist `"presentation"`.
 *
 * Alle übrigen 16 Titel (11 Slots, Video Poker, Plinko, Mines, Dice, Wheel) haben genau
 * einen Modus. `is_live_presentation` markiert die drei simulierten Live-Tische (identisch
 * zu `Game.isLiveDemo` in data/games.ts) — unabhängig von `kind`, das die Regel-Ebene
 * beschreibt, während `is_live_presentation` die Darstellungs-Ebene beschreibt.
 */

export interface ModeDefinition {
  /** = heutige Game.id (data/games.ts) = game_mode.id. Kein neuer Bezeichner. */
  id: string;
  key: string;
  label: string;
  kind: GameModeKind;
  engineKey: EngineKey;
  isLivePresentation: boolean;
  isDefault: boolean;
}

export interface TitleDefinition {
  /** Neue Titel-ID (game.id), unabhängig von jeder bestehenden Game.id. */
  id: string;
  slug: string;
  /** Nur bei mehreren Modi von Hand vergeben; bei genau einem Modus wird `Game.name` verwendet. */
  name?: string;
  modes: readonly ModeDefinition[];
}

const ROULETTE: TitleDefinition = {
  id: "gm-roulette",
  slug: "roulette",
  name: "Roulette",
  modes: [
    {
      id: "g-european-roulette",
      key: "european",
      label: "Europäisch",
      kind: "variant",
      engineKey: "roulette",
      isLivePresentation: false,
      isDefault: true,
    },
    {
      id: "g-american-roulette",
      key: "american",
      label: "Amerikanisch",
      kind: "variant",
      engineKey: "roulette",
      isLivePresentation: false,
      isDefault: false,
    },
    {
      id: "g-live-roulette-demo",
      key: "live",
      label: "Live",
      kind: "presentation",
      engineKey: "roulette",
      isLivePresentation: true,
      isDefault: false,
    },
  ],
};

const BLACKJACK: TitleDefinition = {
  id: "gm-blackjack",
  slug: "blackjack",
  name: "Blackjack",
  modes: [
    {
      id: "g-classic-blackjack",
      key: "classic",
      label: "Klassisch",
      kind: "variant",
      engineKey: "blackjack",
      isLivePresentation: false,
      isDefault: true,
    },
    {
      id: "g-vip-blackjack",
      key: "vip",
      label: "VIP",
      kind: "presentation",
      engineKey: "blackjack",
      isLivePresentation: false,
      isDefault: false,
    },
    {
      id: "g-live-blackjack-demo",
      key: "live",
      label: "Live",
      kind: "presentation",
      engineKey: "blackjack",
      isLivePresentation: true,
      isDefault: false,
    },
  ],
};

const BACCARAT: TitleDefinition = {
  id: "gm-baccarat",
  slug: "baccarat",
  name: "Baccarat",
  modes: [
    {
      id: "g-baccarat",
      key: "standard",
      label: "Standard",
      kind: "variant",
      engineKey: "baccarat",
      isLivePresentation: false,
      isDefault: true,
    },
    {
      id: "g-live-baccarat-demo",
      key: "live",
      label: "Live",
      kind: "presentation",
      engineKey: "baccarat",
      isLivePresentation: true,
      isDefault: false,
    },
  ],
};

/** Einzelspiele ohne Varianten → Engine-Familie. Reihenfolge = Reihenfolge in data/games.ts. */
const SINGLE_MODE_ENGINE_KEY: readonly (readonly [string, EngineKey])[] = [
  ["g-classic-fruit", "slot"],
  ["g-neon-nights", "slot"],
  ["g-kupferschacht", "slot"],
  ["g-codex-aurelia", "slot"],
  ["g-salzwind", "slot"],
  ["g-sandkoenigin", "slot"],
  ["g-mystic-jungle", "slot"],
  ["g-luxury-7s", "slot"],
  ["g-staubpfad", "slot"],
  ["g-zunderschuppe", "slot"],
  ["g-lunara-drift", "slot"],
  ["g-video-poker", "videopoker"],
  ["g-plinko-demo", "plinko"],
  ["g-mines-demo", "mines"],
  ["g-dice-demo", "dice"],
  ["g-wheel-demo", "wheel"],
];

function singleModeTitle(gameId: string, engineKey: EngineKey): TitleDefinition {
  const source = findGameById(gameId);
  if (!source) throw new Error(`Seed-Gruppierung: „${gameId}" existiert nicht mehr in data/games.ts.`);
  return {
    id: `gm-${source.slug}`,
    slug: source.slug,
    modes: [
      {
        id: gameId,
        key: "standard",
        label: "Standard",
        kind: "variant",
        engineKey,
        isLivePresentation: false,
        isDefault: true,
      },
    ],
  };
}

/**
 * Alle 19 Titel. Reihenfolge hier bestimmt `game.sortOrder`/`game_mode.sortOrder` (siehe
 * seed.ts) — eine sinnvolle Katalogreihenfolge, nicht zwingend identisch mit der Position in
 * data/games.ts (dort stehen die Live-Demos separat am Ende, hier bei ihrem Titel).
 */
export const TITLES: readonly TitleDefinition[] = [
  ...SINGLE_MODE_ENGINE_KEY.map(([id, engineKey]) => singleModeTitle(id, engineKey)),
  ROULETTE,
  BLACKJACK,
  BACCARAT,
];

/** Paytable-Schlüssel eines Modus: die eigene ID, wenn data/paytables Einträge dafür führt, sonst null. */
export function paytableKeyFor(modeId: string): string | null {
  return hasPaytable(modeId) ? modeId : null;
}
