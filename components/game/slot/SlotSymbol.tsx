import {
  Amphora, Anchor, Apple, Banana, Bell, Bird, BookOpen, Bug, Candy, Cherry, Circle, Citrus, Clover, Coins, Cog,
  Compass, Crown, Diamond, Drill, Droplet, Eclipse, Eye, Fan, Feather, Fish, Flame, Flower, Gem, Grape, Hammer,
  Hexagon, Hourglass, Key, Lamp, Leaf, LifeBuoy, Map, MapPin, Moon, MoonStar, Mountain, Orbit, PawPrint, Pickaxe,
  Pyramid, Sailboat, Scroll, Shell, Shield, Shovel, Sparkle, Sparkles, Star, Sun, Sword, Telescope, Tent, TreePalm,
  Trees, Waves, Wind, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SlotSymbolId } from "./symbols";
import { SYMBOL_LABEL } from "./symbols";
import { cn } from "@/lib/cn";

const icons: Record<SlotSymbolId, LucideIcon> = {
  circle: Circle,
  hexagon: Hexagon,
  diamond: Diamond,
  star: Star,
  gem: Gem,
  zap: Zap,
  crown: Crown,
  moon: Moon,
  bolt: Sparkle,
  cherry: Cherry,
  citrus: Citrus,
  grape: Grape,
  apple: Apple,
  banana: Banana,
  bell: Bell,
  clover: Clover,
  candy: Candy,
  pickaxe: Pickaxe,
  hammer: Hammer,
  drill: Drill,
  mountain: Mountain,
  lamp: Lamp,
  cog: Cog,
  coins: Coins,
  shovel: Shovel,
  scroll: Scroll,
  book: BookOpen,
  feather: Feather,
  key: Key,
  hourglass: Hourglass,
  anchor: Anchor,
  compass: Compass,
  sailboat: Sailboat,
  waves: Waves,
  shell: Shell,
  fish: Fish,
  map: Map,
  buoy: LifeBuoy,
  wind: Wind,
  pyramid: Pyramid,
  amphora: Amphora,
  sun: Sun,
  palm: TreePalm,
  scarab: Bug,
  leaf: Leaf,
  flower: Flower,
  bird: Bird,
  trees: Trees,
  droplet: Droplet,
  paw: PawPrint,
  eye: Eye,
  fan: Fan,
  tent: Tent,
  pin: MapPin,
  shield: Shield,
  sword: Sword,
  flame: Flame,
  moonstar: MoonStar,
  orbit: Orbit,
  eclipse: Eclipse,
  sparkles: Sparkles,
  telescope: Telescope,
};

/**
 * Farbstufen der Symbole. Gold bleibt knapp: Es ist die Strichfarbe der wertvollsten Symbole
 * eines Spiels, nie eine Fläche. Die Ergebnisklasse wird zusätzlich immer als Text ausgegeben —
 * Farbe ist nie die alleinige Information.
 */
const goldStrong = new Set<SlotSymbolId>(["crown", "coins", "sun", "eye", "moonstar", "anchor", "bell", "zap", "flame"]);
const gold = new Set<SlotSymbolId>(["star", "lamp", "cherry", "pyramid", "book", "gem", "key"]);
const accent = new Set<SlotSymbolId>([
  "diamond", "droplet", "waves", "fish", "shell", "buoy", "compass", "sailboat", "leaf", "flower", "trees",
  "orbit", "eclipse", "telescope", "sparkles", "clover", "citrus", "grape", "bird", "paw",
]);
const bright = new Set<SlotSymbolId>([
  "moon", "bolt", "hexagon", "feather", "scroll", "hourglass", "map", "wind", "shield", "sword", "amphora",
  "palm", "scarab", "tent", "fan", "mountain", "apple", "banana", "candy", "pin",
]);

function colorFor(id: SlotSymbolId): string {
  if (goldStrong.has(id)) return "text-gold-strong";
  if (gold.has(id)) return "text-gold";
  if (accent.has(id)) return "text-accent";
  if (bright.has(id)) return "text-primary/80";
  return "text-muted";
}

export function SlotSymbol({ id, className, highlight }: { id: SlotSymbolId; className?: string; highlight?: boolean }) {
  const Icon = icons[id];
  return (
    <span className={cn("inline-flex items-center justify-center", colorFor(id), className)} role="img" aria-label={SYMBOL_LABEL[id]}>
      <Icon className={cn("size-9 sm:size-11", highlight && "fill-current/20")} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}
