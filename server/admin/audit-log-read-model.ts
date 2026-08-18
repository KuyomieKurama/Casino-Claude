import { z } from "zod";
import type { AppDatabase } from "@/server/db/types";
import { countAdminAuditLog, listAdminAuditLogPage, type AdminAuditLogRecord } from "@/server/repositories/admin-audit-log-repository";

/**
 * Server-Lesepfad für die paginierte Audit-Log-Ansicht (Admin-Auftrag §4: „Ansicht mit
 * Blätterung, keine unbegrenzte Abfrage"). Dasselbe URL-getriebene Keyset-Cursor-Muster wie
 * server/wallet/ledger-history.ts — Blättern ist ein normaler Link, kein Client-Zustand.
 */

/** Seitengröße — fest, niemals vom Client bestimmbar. */
export const AUDIT_LOG_PAGE_SIZE = 25;

export const auditLogSearchParamsSchema = z.object({
  cursors: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return [] as number[];
      return v
        .split(",")
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0);
    })
    .catch([] as number[]),
});

export type AuditLogSearchParams = z.infer<typeof auditLogSearchParamsSchema>;

export interface AuditLogPage {
  entries: AdminAuditLogRecord[];
  hasMore: boolean;
  total: number;
}

export async function resolveAuditLogPage(db: AppDatabase, cursor: number | undefined): Promise<AuditLogPage> {
  const [page, total] = await Promise.all([
    listAdminAuditLogPage(db, { limit: AUDIT_LOG_PAGE_SIZE, ...(cursor !== undefined ? { beforeSeq: cursor } : {}) }),
    countAdminAuditLog(db),
  ]);
  return { entries: page.entries, hasMore: page.hasMore, total };
}
