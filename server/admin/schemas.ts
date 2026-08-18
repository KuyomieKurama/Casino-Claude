import { z } from "zod";

/**
 * Eingabevalidierung für die Admin-Route-Handler (Admin-Auftrag „Übergreifend": „Jede ändernde
 * Aktion validiert Eingaben mit zod"). Jedes Schema kennt bewusst NUR die Felder, die die
 * jeweilige Aktion wirklich braucht — insbesondere kein `role`-Feld irgendwo in diesem Modul
 * (Admin-Auftrag §3: „Admin-Rolle... über die Oberfläche weder vergeben noch entzogen").
 */

const USER_STATUS_VALUES = ["active", "disabled"] as const;
const CATALOG_STATUS_VALUES = ["active", "inactive"] as const;

export const userStatusUpdateSchema = z.object({ status: z.enum(USER_STATUS_VALUES) });
export type UserStatusUpdateBody = z.infer<typeof userStatusUpdateSchema>;

export const gameStatusUpdateSchema = z.object({ status: z.enum(CATALOG_STATUS_VALUES) });
export type GameStatusUpdateBody = z.infer<typeof gameStatusUpdateSchema>;

export const gameModeStatusUpdateSchema = z.object({ status: z.enum(CATALOG_STATUS_VALUES) });
export type GameModeStatusUpdateBody = z.infer<typeof gameModeStatusUpdateSchema>;

export const gameListingUpdateSchema = z.object({
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type GameListingUpdateBody = z.infer<typeof gameListingUpdateSchema>;
