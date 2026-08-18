import type { AppDatabase } from "@/server/db/types";
import { insertAdminAuditLogEntry } from "@/server/repositories/admin-audit-log-repository";

/**
 * Transaktionale Klammer für JEDE Admin-Schreiboperation (Admin-Auftrag §4: „Jede
 * Admin-Schreiboperation schreibt in derselben Transaktion einen Eintrag. Kein Audit-Eintrag
 * bedeutet kein Commit.").
 *
 * Funktionsweise: `mutate` führt die eigentliche Fachänderung aus und liefert das Ergebnis sowie
 * die Vorher-/Nachher-Ansicht für den Audit-Eintrag zurück. Erst danach schreibt diese Funktion
 * den Audit-Eintrag — beides innerhalb `db.transaction(...)`. Zwei Fehlerfälle sind damit
 * symmetrisch abgesichert:
 *
 * 1. `mutate` wirft (z. B. eine Geschäftsregel verletzt) → die Transaktion rollt zurück, es
 *    existiert weder eine Fachänderung noch ein Audit-Eintrag.
 * 2. `mutate` gelingt, aber der Audit-INSERT schlägt fehl (z. B. ein ungültiger `actorUserId`,
 *    der den Fremdschlüssel auf `user.id` verletzt) → dieselbe Transaktion rollt vollständig
 *    zurück. Die Fachänderung existiert dann NICHT, obwohl `mutate` selbst "erfolgreich" lief —
 *    genau das verhindert einen Zustand mit Wirkung, aber ohne Nachvollziehbarkeit.
 *
 * `AppDatabase["transaction"]` reicht innerhalb von `mutate` eine Transaktions-gebundene
 * Datenbankinstanz durch (`tx`), damit `mutate` selbst weitere Schreiboperationen ausführen kann,
 * die garantiert im selben Commit/Rollback landen wie der Audit-Eintrag.
 */
export interface AuditContext {
  /** Aus der geprüften Admin-Sitzung (requireAdmin()), niemals aus einer Anfrageangabe. */
  actorUserId: string;
  /** Kurzer, stabiler Aktionsname, z. B. "user.status.update". */
  action: string;
  entityType: string;
  entityId: string;
}

export interface AuditedMutationResult<T> {
  result: T;
  /** Zustand vor der Änderung — `null`, wenn es (z. B. bei einer Neuanlage) keinen gab. */
  before: unknown;
  /** Zustand nach der Änderung. */
  after: unknown;
}

export async function runAuditedAdminAction<T>(
  db: AppDatabase,
  ctx: AuditContext,
  mutate: (tx: AppDatabase) => Promise<AuditedMutationResult<T>>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const { result, before, after } = await mutate(tx);
    await insertAdminAuditLogEntry(tx, {
      actorUserId: ctx.actorUserId,
      action: ctx.action,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      before,
      after,
    });
    return result;
  });
}
