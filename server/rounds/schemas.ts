import { z } from "zod";

/**
 * Eingabevalidierung für `POST /api/rounds/start` (Auftrag §3, „Eingaben mit zod validieren").
 *
 * Der Client sendet AUSSCHLIESSLICH Modus, Einsatz, optionale Wettauswahl und einen
 * Idempotenzschlüssel — niemals `returnMinor`, `outcomeKey` oder einen Seed. Ein manipulierter
 * Client, der diese Felder trotzdem mitschickt, hat keine Wirkung: Dieses Schema kennt sie gar
 * nicht (unbekannte Felder werden von `z.object` standardmäßig verworfen, nicht durchgereicht),
 * und `server/rounds/round-service.ts` liest niemals `request.body.returnMinor` o. Ä.
 */
export const startRoundRequestSchema = z.object({
  /** = game_mode.id, identisch zur heutigen Game.id (server/db/schema.ts). */
  gameModeId: z.string().min(1).max(100),
  stakeMinor: z.number().int().positive().max(99_999_999_99),
  /** Pro Rundenstart-Versuch eindeutig; ein erneuter Versuch mit demselben Wert bucht nicht doppelt. */
  idempotencyKey: z.string().min(8).max(200),
  useFreeSpin: z.boolean().optional(),
  /** Einfache Wettauswahl (Dice, Baccarat) — der Schlüssel in der Auszahlungstabelle. */
  betId: z.string().min(1).max(64).optional(),
  /** Strukturierte Wettauswahl (Roulette) — Familien-spezifisch geprüft in engine-resolvers.ts. */
  bet: z.unknown().optional(),
});

export type StartRoundRequestBody = z.infer<typeof startRoundRequestSchema>;
