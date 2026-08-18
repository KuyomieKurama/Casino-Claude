import { z } from "zod";

/**
 * Eingabevalidierung für die RG-Endpunkte (Auftrag „Eingaben mit zod validieren"). Diskriminierte
 * Unions statt eines Endpunkts je Aktion — dieselbe Idee wie server/rounds/interactive-
 * schemas.ts::roundActionRequestSchema, hier über ein `action`-Feld statt eines URL-Segments,
 * damit `app/api/rg/**` bei der überschaubaren Zahl an Einstellungsaktionen nicht in sieben
 * nahezu identische Routendateien zerfällt (KISS/DRY). Jede Variante kennt nur die Felder, die
 * ihre Aktion tatsächlich braucht — nie `userId` (die kommt ausschließlich aus der Sitzung).
 */

export const rgSettingsRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause"), minutes: z.number().int().min(1).max(43_200) }),
  z.object({ action: z.literal("endPause") }),
  z.object({ action: z.literal("setSessionLimit"), minutes: z.number().int().min(1).max(1_440).nullable() }),
  z.object({ action: z.literal("setReminderInterval"), minutes: z.number().int().min(5).max(180) }),
  z.object({ action: z.literal("markReminderShown") }),
  z.object({ action: z.literal("startNewSession") }),
]);
export type RgSettingsRequestBody = z.infer<typeof rgSettingsRequestSchema>;

/**
 * Selbstsperre eigens von den übrigen Einstellungen getrennt (kritische Aktion, Auftrag §3):
 * `activate` wirkt sofort mit einem Aufruf, `requestLift`/`confirmLift` erzwingen zwei getrennte
 * Aufrufe zum Aufheben — ein einzelner `confirmLift`-Aufruf ohne vorausgehenden `requestLift`
 * bewirkt serverseitig nichts (server/repositories/rg-settings-repository.ts).
 */
export const rgSelfExclusionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("requestLift") }),
  z.object({ action: z.literal("confirmLift") }),
]);
export type RgSelfExclusionRequestBody = z.infer<typeof rgSelfExclusionRequestSchema>;
