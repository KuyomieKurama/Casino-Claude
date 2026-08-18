import { desc, lt, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { adminAuditLog } from "@/server/db/schema";
import { createId } from "@/lib/ids";

/**
 * Repository für `admin_audit_log` (Admin-Auftrag §4). Append-only: es gibt hier bewusst keine
 * `update`/`delete`-Funktion, dieselbe Begründung wie server/repositories/ledger-repository.ts.
 *
 * `insertAdminAuditLogEntry` nimmt absichtlich KEIN eigenes `db.transaction(...)` vor — diese
 * Funktion ist ein einzelner INSERT, der von server/admin/audit.ts als Teil einer größeren
 * Transaktion (Fachänderung + Audit-Eintrag) aufgerufen wird. Ein eigener, verschachtelter
 * Transaktionsrahmen hier würde diese Atomaritätsgarantie nur verschleiern.
 */

export interface AdminAuditLogRecord {
  id: string;
  seq: number;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface InsertAdminAuditLogInput {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

function toRecord(row: typeof adminAuditLog.$inferSelect): AdminAuditLogRecord {
  return {
    id: row.id,
    seq: row.seq,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertAdminAuditLogEntry(db: AppDatabase, input: InsertAdminAuditLogInput): Promise<AdminAuditLogRecord> {
  const [row] = await db
    .insert(adminAuditLog)
    .values({
      id: createId("audit"),
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
    })
    .returning();
  if (!row) throw new Error("Audit-Eintrag konnte nicht gespeichert werden.");
  return toRecord(row);
}

export interface ListAdminAuditLogPageOptions {
  /** Seitengröße — vom Aufrufer auf eine feste Obergrenze geprüft, nie vom Client roh übernommen. */
  limit: number;
  /** Keyset-Cursor: nur Einträge MIT kleinerer seq als dieser Wert (die nächstälteren). */
  beforeSeq?: number;
}

export interface AdminAuditLogPage {
  entries: AdminAuditLogRecord[];
  hasMore: boolean;
}

/**
 * Paginierte Ansicht (Admin-Auftrag §4: „keine unbegrenzte Abfrage"), neueste zuerst.
 * Keyset-Pagination über `seq` (global monoton, siehe server/db/schema.ts::adminAuditLog) statt
 * OFFSET — bleibt bei wachsender Historie konstant schnell und liefert bei gleichzeitigen neuen
 * Einträgen keine verschobenen/doppelten Zeilen. Lädt genau `limit + 1` Zeilen, um `hasMore` ohne
 * separate COUNT-Abfrage zu bestimmen (dasselbe Muster wie ledger-repository.ts::listLedgerEntriesPage).
 */
export async function listAdminAuditLogPage(db: AppDatabase, options: ListAdminAuditLogPageOptions): Promise<AdminAuditLogPage> {
  const rows = await db
    .select()
    .from(adminAuditLog)
    .where(options.beforeSeq !== undefined ? lt(adminAuditLog.seq, options.beforeSeq) : undefined)
    .orderBy(desc(adminAuditLog.seq))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  return { entries: page.map(toRecord), hasMore };
}

/** Gesamtzahl der Audit-Einträge — eine einzelne aggregierte Zeile, für die a11y-Statuszeile. */
export async function countAdminAuditLog(db: AppDatabase): Promise<number> {
  const [row] = await db.select({ total: sql<string>`COUNT(*)` }).from(adminAuditLog);
  return Number(row?.total ?? 0);
}
