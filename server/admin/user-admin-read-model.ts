import { z } from "zod";
import type { AppDatabase } from "@/server/db/types";
import { listAdminUsers } from "@/server/repositories/user-admin-repository";
import { findRgSettings } from "@/server/repositories/rg-settings-repository";
import type { AdminUserListItem } from "@/types/admin";

/** URL-getriebene Seitenzahl (1-basiert) für die Nutzerliste (Admin-Auftrag §3). */
export const ADMIN_USERS_PAGE_SIZE = 20;

export const adminUsersSearchParamsSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : 1;
    })
    .catch(1),
});

export interface AdminUsersPage {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Reichert jede Zeile um eine LESENDE Kurzfassung der Responsible-Gaming-Einstellungen an
 * (Admin-Auftrag §3: „Einsicht ... lesend"). Begrenzt auf die aktuelle Seite (≤
 * ADMIN_USERS_PAGE_SIZE Nutzer), also keine unbegrenzte Zahl zusätzlicher Abfragen.
 */
export async function resolveAdminUsersPage(db: AppDatabase, page: number): Promise<AdminUsersPage> {
  const safePage = Math.max(1, page);
  const { items, total } = await listAdminUsers(db, { limit: ADMIN_USERS_PAGE_SIZE, offset: (safePage - 1) * ADMIN_USERS_PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));

  const enriched: AdminUserListItem[] = await Promise.all(
    items.map(async (item) => {
      const rgSettings = await findRgSettings(db, item.id);
      return {
        ...item,
        rg: rgSettings ? { selfExcluded: rgSettings.selfExcluded, sessionLimitMinutes: rgSettings.sessionLimitMinutes, pausedUntil: rgSettings.pausedUntil } : null,
      };
    }),
  );

  return { items: enriched, total, page: safePage, pageCount };
}
