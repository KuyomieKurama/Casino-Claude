import type { AppDatabase } from "@/server/db/types";
import type { UserStatus } from "@/server/db/enums";
import { countSessionsForUser, deleteSessionsForUser, findAdminUserById, updateAdminUserStatus } from "@/server/repositories/user-admin-repository";
import { runAuditedAdminAction } from "./audit";

/**
 * Nutzerverwaltung (Admin-Auftrag §3). Jede Schreiboperation läuft über
 * `runAuditedAdminAction` (Admin-Auftrag §4) — Fachänderung und Audit-Eintrag committen
 * gemeinsam oder gar nicht.
 *
 * `actorUserId` kommt in JEDEM Fall aus der geprüften Admin-Sitzung (requireAdmin(), siehe
 * app/api/admin/**​/route.ts), niemals aus einer Anfrageangabe.
 */

export type SetUserStatusResult =
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof findAdminUserById>>> }
  | { ok: false; reason: "NOT_FOUND" }
  | { ok: false; reason: "SELF_LOCK_FORBIDDEN" };

/**
 * Sperrt/entsperrt ein Konto. Admin-Auftrag §3: „Ein Admin darf sich nicht selbst sperren" — die
 * Prüfung steht VOR jedem Datenbankzugriff, damit ein Selbstsperrversuch nicht einmal eine
 * (dann zurückzurollende) Transaktion eröffnet.
 */
export async function setUserStatus(db: AppDatabase, actorUserId: string, targetUserId: string, status: UserStatus): Promise<SetUserStatusResult> {
  if (status === "disabled" && targetUserId === actorUserId) {
    return { ok: false, reason: "SELF_LOCK_FORBIDDEN" };
  }

  const before = await findAdminUserById(db, targetUserId);
  if (!before) return { ok: false, reason: "NOT_FOUND" };
  if (before.status === status) {
    // Keine tatsächliche Änderung — kein Audit-Eintrag für ein Nichts-Tun (der Eintrag soll
    // wirkliche Änderungen dokumentieren, keine wiederholten Klicks auf denselben Zustand).
    return { ok: true, user: before };
  }

  const updated = await runAuditedAdminAction(
    db,
    { actorUserId, action: "user.status.update", entityType: "user", entityId: targetUserId },
    async (tx) => {
      const after = await updateAdminUserStatus(tx, targetUserId, status);
      if (!after) throw new Error(`Nutzer „${targetUserId}" konnte nicht aktualisiert werden (nach vorherigem Fund nicht mehr vorhanden).`);
      return { result: after, before, after };
    },
  );

  return { ok: true, user: updated };
}

export type RevokeUserSessionsResult = { ok: true; revokedCount: number } | { ok: false; reason: "NOT_FOUND" };

/** Widerruft alle Sitzungen eines Nutzers (Admin-Auftrag §3: „Sitzungen eines Nutzers widerrufen"). */
export async function revokeUserSessions(db: AppDatabase, actorUserId: string, targetUserId: string): Promise<RevokeUserSessionsResult> {
  const target = await findAdminUserById(db, targetUserId);
  if (!target) return { ok: false, reason: "NOT_FOUND" };

  const revokedCount = await runAuditedAdminAction(
    db,
    { actorUserId, action: "user.sessions.revoke", entityType: "user", entityId: targetUserId },
    async (tx) => {
      const before = await countSessionsForUser(tx, targetUserId);
      const deleted = await deleteSessionsForUser(tx, targetUserId);
      return { result: deleted, before: { activeSessionCount: before }, after: { activeSessionCount: 0 } };
    },
  );

  return { ok: true, revokedCount };
}
