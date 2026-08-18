import { z } from "zod";
import type { EngineKey } from "@/server/db/enums";
import type { EngineOutcome } from "@/types/engine";
import type { WalletRejectionCode } from "@/lib/wallet-policy";
import { resolveRound } from "@/lib/rng";
import { findPaytable } from "@/data/paytables";
// Ausnahme in eslint.config.mjs (server/**-Regel): Diese Importe ziehen ausschließlich reine,
// React-freie *-logic.ts-Module — dieselbe Fachlogik, die auch die Client-Oberflächen nutzen
// (Auftrag §4: „Der Server ruft dieselbe reine Engine-Logik auf wie bisher"). Kein Import von
// *Game.tsx, GameShell.tsx, registry.tsx oder useRound.ts ist über diese Ausnahme erlaubt.
import { resolveDice } from "@/components/game/engine/arcade/dice-logic";
import { resolvePlinko } from "@/components/game/engine/arcade/plinko-logic";
import { resolveWheel } from "@/components/game/engine/arcade/wheel-logic";
import { isBaccaratBetId, resolveBaccaratRound } from "@/components/game/engine/baccarat/baccarat-logic";
import {
  betKindsFor,
  COLOR_LABEL,
  formatPocket,
  pocketColor,
  resolveBet as resolveRouletteBet,
  spin,
  type BetKind,
  type Pocket,
  type RouletteBet,
  type RouletteVariant,
} from "@/components/game/engine/roulette/roulette-logic";

/**
 * Serverseitige Auflösung der sechs nicht-interaktiven Spielfamilien (Auftrag §3). Jede Familie
 * ruft exakt dieselbe reine Funktion auf, die auch die jeweilige Client-Oberfläche verwendet hat
 * — die Fachlogik selbst bleibt unverändert (`components/game/engine/<familie>/*-logic.ts`, `lib/rng.ts`).
 * Der Unterschied ist ausschließlich, WER `resolve()` aufruft (jetzt der Server, mit einem
 * serverseitig erzeugten Seed) und WER das Ergebnis anschließend bucht (jetzt der Server, über
 * die Wallet-/Ledger-Repositories statt über den Client-Reducer).
 */

export const NON_INTERACTIVE_ENGINE_KEYS: ReadonlySet<EngineKey> = new Set([
  "slot",
  "roulette",
  "baccarat",
  "dice",
  "plinko",
  "wheel",
]);

export type EngineResolveContext = {
  /** = game_mode.id, identisch zur heutigen Game.id (server/db/schema.ts). */
  gameModeId: string;
  stakeMinor: number;
  seed: number;
  betId?: string;
  /** Strukturierte Wettauswahl für Familien, denen ein einfacher `betId` nicht reicht (Roulette). */
  bet?: unknown;
};

export type EngineResolveResult =
  | { ok: true; outcome: EngineOutcome; betKey?: string }
  | { ok: false; code: WalletRejectionCode };

const pocketSchema: z.ZodType<Pocket> = z.union([z.number().int().min(0).max(36), z.literal("00")]);

/** Spiegelt die `RouletteBet`-Union aus roulette-logic.ts (unverändert) als Eingabevalidierung. */
const rouletteBetSchema: z.ZodType<RouletteBet> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("straight"), pocket: pocketSchema }),
  z.object({ kind: z.literal("split"), a: pocketSchema, b: pocketSchema }),
  z.object({ kind: z.literal("street"), row: z.number().int().min(1).max(12) }),
  z.object({ kind: z.literal("corner"), anchor: z.number().int().min(1).max(34) }),
  z.object({ kind: z.literal("sixline"), row: z.number().int().min(1).max(11) }),
  z.object({ kind: z.literal("column"), column: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ kind: z.literal("dozen"), dozen: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ kind: z.literal("red") }),
  z.object({ kind: z.literal("black") }),
  z.object({ kind: z.literal("even") }),
  z.object({ kind: z.literal("odd") }),
  z.object({ kind: z.literal("low") }),
  z.object({ kind: z.literal("high") }),
  z.object({ kind: z.literal("five") }),
]);

function resolveRoulette(ctx: EngineResolveContext): EngineResolveResult {
  const parsedBet = rouletteBetSchema.safeParse(ctx.bet);
  if (!parsedBet.success) return { ok: false, code: "INVALID_STAKE" };
  const variant: RouletteVariant = ctx.gameModeId === "g-american-roulette" ? "american" : "european";
  const kind: BetKind = parsedBet.data.kind;
  if (!betKindsFor(variant).includes(kind)) return { ok: false, code: "INVALID_STAKE" };

  const result = spin(ctx.seed, variant);
  const returnMinor = resolveRouletteBet(parsedBet.data, result.pocket, ctx.stakeMinor);
  const hit = returnMinor > 0;
  const color = pocketColor(result.pocket);
  return {
    ok: true,
    betKey: kind,
    outcome: {
      outcomeKey: hit ? "win" : "none",
      outcomeLabel: `Fach ${formatPocket(result.pocket)} ${COLOR_LABEL[color]} — ${hit ? "Treffer" : "kein Treffer"}`,
      returnMinor,
      detail: { pocket: formatPocket(result.pocket), color, betId: kind },
    },
  };
}

/**
 * Löst eine nicht-interaktive Runde serverseitig auf. `ctx.seed` MUSS aus
 * `server/rounds/round-service.ts` stammen (`crypto.randomInt`) — diese Funktion erzeugt selbst
 * keinen Zufall, sie ist rein (gleicher Seed + gleiche Eingabe ⇒ gleiches Ergebnis), damit der
 * Wiedergabetest (Auftrag §8) exakt reproduzierbare Ergebnisse prüfen kann.
 */
export function resolveNonInteractiveOutcome(engineKey: EngineKey, ctx: EngineResolveContext): EngineResolveResult {
  switch (engineKey) {
    case "slot": {
      const paytable = findPaytable(ctx.gameModeId);
      if (!paytable) return { ok: false, code: "INVALID_STAKE" };
      const { entry, returnMinor } = resolveRound(paytable, ctx.stakeMinor, ctx.seed);
      return { ok: true, outcome: { outcomeKey: entry.key, outcomeLabel: entry.label, returnMinor } };
    }
    case "dice": {
      return { ok: true, outcome: resolveDice(ctx.stakeMinor, ctx.seed, ctx.betId), ...(ctx.betId ? { betKey: ctx.betId } : {}) };
    }
    case "plinko":
      return { ok: true, outcome: resolvePlinko(ctx.stakeMinor, ctx.seed) };
    case "wheel":
      return { ok: true, outcome: resolveWheel(ctx.stakeMinor, ctx.seed) };
    case "baccarat": {
      const outcome = resolveBaccaratRound({ stakeMinor: ctx.stakeMinor, seed: ctx.seed, betId: ctx.betId });
      const betKey = isBaccaratBetId(ctx.betId) ? ctx.betId : "player";
      return { ok: true, outcome, betKey };
    }
    case "roulette":
      return resolveRoulette(ctx);
    default:
      // blackjack, mines, videopoker: interaktiv, gehören nicht in diese Phase (Auftrag §3).
      return { ok: false, code: "INVALID_STAKE" };
  }
}
