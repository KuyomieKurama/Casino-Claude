import { mulberry32 } from "@/lib/rng";

/**
 * Darstellung der Ergebnisklassen als Walzensymbole. Die Anzeige folgt dem Ergebnis, nie umgekehrt:
 * Erst entscheidet die Auszahlungstabelle (lib/rng), dann werden passende Symbole gerendert.
 *
 * Kein Near Miss (Regel 7) — gilt für JEDES Spiel, nicht nur für die Referenzengine:
 *  - Nullrunde: auf der Gewinnlinie stehen ausschließlich VERSCHIEDENE Symbole, nie zwei gleiche
 *    plus ein knapp verfehltes drittes.
 *  - Auf der Linie einer Nullrunde erscheinen zusätzlich keine Symbole der höchsten Klassen —
 *    sonst entstünde optisch ein „fast die Krone getroffen“, also genau die betonte
 *    Beinahe-Wirkung, die Regel 7 ausschließt.
 *  - Füllzeilen (oben, unten) bilden nie drei gleiche Symbole, damit keine zweite Scheinlinie
 *    entsteht.
 */

export type SlotSymbolId =
  // Neon Nights (Referenz)
  | "circle" | "hexagon" | "diamond" | "star" | "gem" | "zap" | "crown" | "moon" | "bolt"
  // Classic Fruit
  | "cherry" | "citrus" | "grape" | "apple" | "banana" | "bell" | "clover" | "candy"
  // Kupferschacht
  | "pickaxe" | "hammer" | "drill" | "mountain" | "lamp" | "cog" | "coins" | "shovel"
  // Codex Aurelia
  | "scroll" | "book" | "feather" | "key" | "hourglass"
  // Salzwind
  | "anchor" | "compass" | "sailboat" | "waves" | "shell" | "fish" | "map" | "buoy" | "wind"
  // Sandkönigin
  | "pyramid" | "amphora" | "sun" | "palm" | "scarab"
  // Mystic Jungle
  | "leaf" | "flower" | "bird" | "trees" | "droplet" | "paw" | "eye"
  // Staubpfad
  | "fan" | "tent" | "pin"
  // Zunderschuppe
  | "shield" | "sword" | "flame"
  // Lunara Drift
  | "moonstar" | "orbit" | "eclipse" | "sparkles" | "telescope";

/** Die acht Ergebnisklassen, die alle Slot-Auszahlungstabellen benutzen (data/paytables/slots.ts). */
export type SlotOutcomeKey = "none" | "partial" | "push" | "small" | "hit" | "big" | "streak" | "top";

export const SLOT_OUTCOME_KEYS: readonly SlotOutcomeKey[] = ["none", "partial", "push", "small", "hit", "big", "streak", "top"];

/** Zuordnung Ergebnisklasse → Symbol auf der Gewinnlinie. „none“ hat bewusst kein Symbol. */
export type OutcomeSymbolMap = Readonly<Record<SlotOutcomeKey, SlotSymbolId | undefined>>;

export type SlotTheme = {
  gameId: string;
  /**
   * Walzenzahl. Drei Walzen für die als „klassisch“ ausgezeichneten Titel, sonst fünf —
   * so beschreibt data/games.ts die Spiele. Geprüft in symbols.test.ts.
   */
  reels: 3 | 5;
  /** Symbolvorrat des Spiels; mindestens `reels` + Anzahl Höchstwertsymbole Einträge. */
  symbols: readonly SlotSymbolId[];
  outcome: OutcomeSymbolMap;
  /** Symbole der höchsten Ergebnisklassen — nie auf der Gewinnlinie einer Nullrunde. */
  highValue: readonly SlotSymbolId[];
};

const themes: readonly SlotTheme[] = [
  {
    gameId: "g-classic-fruit",
    reels: 3,
    symbols: ["cherry", "citrus", "grape", "apple", "banana", "bell", "clover", "candy", "diamond"],
    outcome: { none: undefined, partial: "apple", push: "banana", small: "grape", hit: "citrus", big: "cherry", streak: "clover", top: "bell" },
    highValue: ["bell", "clover", "cherry"],
  },
  {
    gameId: "g-neon-nights",
    reels: 5,
    symbols: ["circle", "hexagon", "diamond", "star", "gem", "zap", "crown", "moon", "bolt"],
    outcome: { none: undefined, partial: "circle", push: "hexagon", small: "diamond", hit: "star", big: "gem", streak: "zap", top: "crown" },
    highValue: ["crown", "zap", "gem"],
  },
  {
    gameId: "g-kupferschacht",
    reels: 5,
    symbols: ["cog", "shovel", "hammer", "drill", "mountain", "pickaxe", "lamp", "gem", "coins"],
    outcome: { none: undefined, partial: "cog", push: "shovel", small: "mountain", hit: "pickaxe", big: "lamp", streak: "gem", top: "coins" },
    highValue: ["coins", "gem", "lamp"],
  },
  {
    gameId: "g-codex-aurelia",
    reels: 5,
    symbols: ["feather", "key", "hourglass", "scroll", "star", "moon", "book", "gem", "crown"],
    outcome: { none: undefined, partial: "feather", push: "key", small: "hourglass", hit: "scroll", big: "book", streak: "gem", top: "crown" },
    highValue: ["crown", "gem", "book"],
  },
  {
    gameId: "g-salzwind",
    reels: 5,
    symbols: ["waves", "wind", "fish", "shell", "map", "buoy", "compass", "sailboat", "anchor"],
    outcome: { none: undefined, partial: "waves", push: "wind", small: "fish", hit: "shell", big: "compass", streak: "sailboat", top: "anchor" },
    highValue: ["anchor", "sailboat", "compass"],
  },
  {
    gameId: "g-sandkoenigin",
    reels: 5,
    symbols: ["hourglass", "palm", "scarab", "amphora", "gem", "feather", "pyramid", "sun", "crown"],
    outcome: { none: undefined, partial: "hourglass", push: "palm", small: "scarab", hit: "amphora", big: "pyramid", streak: "sun", top: "crown" },
    highValue: ["crown", "sun", "pyramid"],
  },
  {
    gameId: "g-mystic-jungle",
    reels: 5,
    symbols: ["droplet", "leaf", "flower", "scarab", "trees", "gem", "bird", "paw", "eye"],
    outcome: { none: undefined, partial: "droplet", push: "leaf", small: "flower", hit: "scarab", big: "bird", streak: "paw", top: "eye" },
    highValue: ["eye", "paw", "bird"],
  },
  {
    gameId: "g-luxury-7s",
    reels: 3,
    symbols: ["circle", "cherry", "clover", "bell", "star", "diamond", "gem", "coins", "crown"],
    outcome: { none: undefined, partial: "circle", push: "cherry", small: "clover", hit: "bell", big: "diamond", streak: "coins", top: "crown" },
    highValue: ["crown", "coins", "diamond"],
  },
  {
    gameId: "g-staubpfad",
    reels: 5,
    symbols: ["droplet", "wind", "pin", "tent", "bird", "star", "fan", "mountain", "sun"],
    outcome: { none: undefined, partial: "droplet", push: "wind", small: "pin", hit: "tent", big: "fan", streak: "mountain", top: "sun" },
    highValue: ["sun", "mountain", "fan"],
  },
  {
    gameId: "g-zunderschuppe",
    reels: 5,
    symbols: ["key", "shield", "sword", "coins", "mountain", "eye", "gem", "flame", "crown"],
    outcome: { none: undefined, partial: "key", push: "shield", small: "sword", hit: "coins", big: "gem", streak: "flame", top: "crown" },
    highValue: ["crown", "flame", "gem"],
  },
  {
    gameId: "g-lunara-drift",
    reels: 5,
    symbols: ["droplet", "star", "sparkles", "moon", "telescope", "hexagon", "eclipse", "orbit", "moonstar"],
    outcome: { none: undefined, partial: "droplet", push: "star", small: "sparkles", hit: "moon", big: "eclipse", streak: "orbit", top: "moonstar" },
    highValue: ["moonstar", "orbit", "eclipse"],
  },
];

export const SLOT_THEMES: Readonly<Record<string, SlotTheme>> = Object.fromEntries(themes.map((t) => [t.gameId, t]));

/** Referenzsatz, wenn ein Spiel keinen eigenen Satz hat — Neon Nights (Referenztabelle aus §6). */
export const DEFAULT_THEME: SlotTheme = SLOT_THEMES["g-neon-nights"]!;

export function themeFor(gameId: string): SlotTheme {
  return SLOT_THEMES[gameId] ?? DEFAULT_THEME;
}

/**
 * Ergebnisklasse → Symbol für die einsehbare Auszahlungstabelle (components/game/PaytableView.tsx).
 * Dort ist kein Spielbezug verfügbar, deshalb steht hier der Referenzsatz von Neon Nights.
 */
export const OUTCOME_SYMBOL: Record<string, SlotSymbolId | undefined> = DEFAULT_THEME.outcome;

export const SYMBOL_LABEL: Record<SlotSymbolId, string> = {
  circle: "Kreis",
  hexagon: "Sechseck",
  diamond: "Raute",
  star: "Stern",
  gem: "Edelstein",
  zap: "Blitz",
  crown: "Krone",
  moon: "Mond",
  bolt: "Funke",
  cherry: "Kirsche",
  citrus: "Zitrone",
  grape: "Traube",
  apple: "Apfel",
  banana: "Banane",
  bell: "Glocke",
  clover: "Kleeblatt",
  candy: "Bonbon",
  pickaxe: "Spitzhacke",
  hammer: "Hammer",
  drill: "Bohrer",
  mountain: "Berg",
  lamp: "Grubenlampe",
  cog: "Zahnrad",
  coins: "Münzen",
  shovel: "Schaufel",
  scroll: "Schriftrolle",
  book: "Aufgeschlagenes Buch",
  feather: "Feder",
  key: "Schlüssel",
  hourglass: "Sanduhr",
  anchor: "Anker",
  compass: "Kompass",
  sailboat: "Segelboot",
  waves: "Wellen",
  shell: "Muschel",
  fish: "Fisch",
  map: "Seekarte",
  buoy: "Rettungsring",
  wind: "Wind",
  pyramid: "Pyramide",
  amphora: "Amphore",
  sun: "Sonne",
  palm: "Palme",
  scarab: "Käfer",
  leaf: "Blatt",
  flower: "Blüte",
  bird: "Vogel",
  trees: "Bäume",
  droplet: "Tropfen",
  paw: "Pfotenabdruck",
  eye: "Auge",
  fan: "Windrad",
  tent: "Zelt",
  pin: "Wegmarke",
  shield: "Schild",
  sword: "Schwert",
  flame: "Flamme",
  moonstar: "Mond mit Stern",
  orbit: "Umlaufbahn",
  eclipse: "Finsternis",
  sparkles: "Funkeln",
  telescope: "Teleskop",
};

/** [reel][row]; Zeile 1 ist die Gewinnlinie. Die Spaltenzahl entspricht der Walzenzahl des Spiels. */
export type ReelGrid = SlotSymbolId[][];

function pickDistinct(rng: () => number, count: number, pool: readonly SlotSymbolId[], exclude: readonly SlotSymbolId[] = []): SlotSymbolId[] {
  const rest = pool.filter((s) => !exclude.includes(s));
  const out: SlotSymbolId[] = [];
  while (out.length < count && rest.length > 0) {
    const idx = Math.floor(rng() * rest.length);
    out.push(rest.splice(idx, 1)[0]!);
  }
  return out;
}

/**
 * Erzeugt das sichtbare Raster für ein Ergebnis — deterministisch aus Spiel, Ergebnisklasse und
 * Rundenseed. Unbekannte Ergebnisklassen werden wie eine Nullrunde behandelt (defensive Vorgabe:
 * lieber keine Linie zeigen als eine falsche).
 */
export function gridForOutcome(gameId: string, outcomeKey: string, seed: number): ReelGrid {
  const theme = themeFor(gameId);
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const lineSymbol = isOutcomeKey(outcomeKey) ? theme.outcome[outcomeKey] : undefined;
  const line: SlotSymbolId[] = lineSymbol
    ? Array.from({ length: theme.reels }, () => lineSymbol)
    : pickDistinct(rng, theme.reels, theme.symbols, theme.highValue);
  const top = pickDistinct(rng, theme.reels, theme.symbols);
  const bottom = pickDistinct(rng, theme.reels, theme.symbols);
  return Array.from({ length: theme.reels }, (_, reel) => [top[reel]!, line[reel]!, bottom[reel]!]);
}

function isOutcomeKey(key: string): key is SlotOutcomeKey {
  return (SLOT_OUTCOME_KEYS as readonly string[]).includes(key);
}

/** Symbolstreifen für die Drehanimation — feste Reihenfolge, doppelt für eine nahtlose Schleife. */
export function reelStrip(gameId: string): SlotSymbolId[] {
  const { symbols } = themeFor(gameId);
  return [...symbols, ...symbols];
}
