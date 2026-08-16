import type { EngineOutcome } from "@/types/engine";
import { mulberry32 } from "@/lib/rng";
import { WHEEL_SEGMENTS, WHEEL_SEGMENT_COUNT, type WheelSegment } from "@/data/paytables/arcade";

/**
 * Wheel Demo — Fachlogik, rein und ohne React.
 *
 * 16 gleich große Segmente, ein Zug aus dem gesäten PRNG bestimmt das Segment.
 * Die Segmentwerte stehen fest in data/paytables/arcade.ts; das Rad wird zwischen Runden nie
 * umsortiert (das wäre die Grundlage jeder Near-Miss-Inszenierung).
 */

export function wheelSegmentAt(index: number): WheelSegment {
  const segment = WHEEL_SEGMENTS[index];
  if (!segment) throw new Error(`Wheel: Segment ${index} existiert nicht (0 … ${WHEEL_SEGMENT_COUNT - 1}).`);
  return segment;
}

export function spinWheel(seed: number): WheelSegment {
  const u = mulberry32(seed)();
  const index = Math.min(WHEEL_SEGMENT_COUNT - 1, Math.floor(u * WHEEL_SEGMENT_COUNT));
  return wheelSegmentAt(index);
}

/**
 * Anti-Near-Miss (Regel 7): Nach der Runde wird genau ein Segment markiert — das getroffene.
 * Nachbarsegmente bleiben unmarkiert, und es gibt keinen Zeiger, der sich verlangsamt an einem
 * hohen Segment vorbeischiebt: die Oberfläche zeigt während der Runde einen neutralen Zustand
 * und danach das Ergebnis. Diese Funktion ist die einzige Quelle der Markierung.
 */
export function wheelHighlight(index: number): number[] {
  return [index];
}

export type WheelRound = {
  segment: WheelSegment;
  returnMinor: number;
};

export function resolveWheelRound(stakeMinor: number, seed: number): WheelRound {
  const segment = spinWheel(seed);
  return { segment, returnMinor: Math.max(0, Math.round(stakeMinor * segment.multiplier)) };
}

export function resolveWheel(stakeMinor: number, seed: number): EngineOutcome {
  const { segment, returnMinor } = resolveWheelRound(stakeMinor, seed);
  return {
    outcomeKey: segment.key,
    outcomeLabel: `${segment.name} · ${formatSegmentValue(segment.multiplier)}`,
    returnMinor,
    detail: { index: segment.index, multiplier: segment.multiplier },
  };
}

/** Segmentwert als Text — das Ergebnis wird benannt, Farbe trägt nie allein die Information. */
export function formatSegmentValue(multiplier: number): string {
  return `${multiplier.toLocaleString("de-DE")}×`;
}

export function parseWheelDetail(detail: Record<string, unknown> | undefined): { index: number } | null {
  if (!detail) return null;
  const index = detail.index;
  if (typeof index !== "number" || index < 0 || index >= WHEEL_SEGMENT_COUNT) return null;
  return { index };
}
