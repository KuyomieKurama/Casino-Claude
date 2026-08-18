import { z } from "zod";

/**
 * Eingabevalidierung für die interaktiven Rundenendpunkte (Phase 3b, Auftrag §2, „Eingaben mit
 * zod validieren"). Derselbe Grundsatz wie server/rounds/schemas.ts: der Client sendet
 * AUSSCHLIESSLICH das, was er selbst bestimmen darf — nie `returnMinor`, `outcomeKey`, einen Seed
 * oder eine `userId`. Unbekannte Felder verwirft `z.object` standardmäßig.
 */

/** POST /api/rounds/interactive-start — startet Blackjack, Mines oder Video Poker. */
export const startInteractiveRoundRequestSchema = z.object({
  /** = game_mode.id, identisch zur heutigen Game.id (server/db/schema.ts). */
  gameModeId: z.string().min(1).max(100),
  stakeMinor: z.number().int().positive().max(99_999_999_99),
  /** Pro Rundenstart-Versuch eindeutig; ein erneuter Versuch mit demselben Wert bucht nicht doppelt. */
  idempotencyKey: z.string().min(8).max(200),
  useFreeSpin: z.boolean().optional(),
  /** Nur Mines kennt eine Wettauswahl (Minenzahl, z. B. "m3") — bei Blackjack/Video Poker leer. */
  betId: z.string().min(1).max(64).optional(),
});
export type StartInteractiveRoundRequestBody = z.infer<typeof startInteractiveRoundRequestSchema>;

/**
 * POST /api/rounds/:id/actions — eine einzelne Spieleraktion. `seq` ist die vom Client vorgegebene
 * Position dieser Aktion innerhalb der Runde (1, 2, 3, …) — Grundlage der Idempotenzsicherung
 * (server/rounds/round-action-service.ts, `UNIQUE (round_id, seq)`). `payload` ist bewusst
 * `z.unknown()`: die konkrete Form (z. B. `{ cell: number }` bei Mines, `{ holds: boolean[] }`
 * bei Video Poker) prüft der jeweilige Adapter, nicht diese generische Hülle.
 */
export const roundActionRequestSchema = z.object({
  seq: z.number().int().positive(),
  action: z.string().min(1).max(32),
  payload: z.unknown().optional(),
});
export type RoundActionRequestBody = z.infer<typeof roundActionRequestSchema>;
