import { count, desc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { user, session } from "@/server/db/auth-schema";
import { gameRound } from "@/server/db/schema";
import type { UserRole, UserStatus } from "@/server/db/enums";

/**
 * Repository für die Nutzerverwaltung (Admin-Auftrag §3). Bewusst getrennt von einem
 * hypothetischen generischen "UserRepository" — better-auth verwaltet die `user`-Tabelle selbst
 * (Registrierung, Login, OAuth), dieses Repository deckt ausschließlich die admin-spezifischen
 * Lese-/Schreibpfade ab (Statuswechsel, Auflistung mit Rundenzahl, Sitzungswiderruf).
 *
 * WICHTIG (Admin-Auftrag §3, „Admin-Rolle... ausschließlich über ADMIN_BOOTSTRAP_EMAIL"): Dieses
 * Repository bietet an KEINER Stelle eine Funktion an, die `role` schreibt — nur `status`. Ein
 * künftiger Aufrufer kann die Admin-Rolle über diesen Layer strukturell nicht vergeben oder
 * entziehen, selbst bei einem Programmierfehler in einer höheren Schicht.
 */

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  isGuest: boolean;
  createdAt: string;
}

/** Roh-Zeile aus dem Repository — server/admin/user-admin-read-model.ts reichert sie um die RG-Kurzfassung zu `types/admin.ts::AdminUserListItem` an. */
export interface AdminUserListRow extends AdminUserRecord {
  roundCount: number;
}

function toRecord(row: typeof user.$inferSelect): AdminUserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    isGuest: row.isGuest,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findAdminUserById(db: AppDatabase, id: string): Promise<AdminUserRecord | null> {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

export interface ListAdminUsersOptions {
  /** Seitengröße — vom Aufrufer auf eine feste Obergrenze geprüft, nie roh vom Client übernommen. */
  limit: number;
  offset: number;
}

export interface ListAdminUsersResult {
  items: AdminUserListRow[];
  total: number;
}

/**
 * Auflistung mit Rundenzahl je Nutzer (Admin-Auftrag §3: „Anzahl Runden"). Eine aggregierte
 * Abfrage (LEFT JOIN + GROUP BY) statt einer Unterabfrage je Zeile — kein N+1. LIMIT/OFFSET statt
 * Keyset-Cursor: die Nutzerliste ist im aktuellen Umfang klein und ändert sich selten
 * gegenüber der Blätterposition, anders als das fortlaufend wachsende Ledger/Audit-Log — OFFSET
 * ist hier die einfachere, ausreichende Lösung (KISS), bleibt aber durch `limit` immer begrenzt.
 */
export async function listAdminUsers(db: AppDatabase, options: ListAdminUsersOptions): Promise<ListAdminUsersResult> {
  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        isGuest: user.isGuest,
        createdAt: user.createdAt,
        roundCount: sql<string>`count(${gameRound.id})`,
      })
      .from(user)
      .leftJoin(gameRound, eq(gameRound.userId, user.id))
      .groupBy(user.id, user.name, user.email, user.role, user.status, user.isGuest, user.createdAt)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(options.limit)
      .offset(options.offset),
    db.select({ total: count() }).from(user),
  ]);

  return {
    items: items.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      isGuest: row.isGuest,
      createdAt: row.createdAt.toISOString(),
      roundCount: Number(row.roundCount),
    })),
    total: totalRows[0]?.total ?? 0,
  };
}

/**
 * Ändert AUSSCHLIESSLICH `status` (sperren/entsperren) — es gibt bewusst keine Funktion, die
 * `role` schreibt (siehe Modulkommentar). `null` bei einem unbekannten Nutzer statt eines
 * generischen Fehlers, damit der Aufrufer (server/admin/user-admin-service.ts) das als
 * "Nutzer nicht gefunden" behandeln kann.
 */
export async function updateAdminUserStatus(db: AppDatabase, id: string, status: UserStatus): Promise<AdminUserRecord | null> {
  const [row] = await db.update(user).set({ status, updatedAt: new Date() }).where(eq(user.id, id)).returning();
  return row ? toRecord(row) : null;
}

export async function countSessionsForUser(db: AppDatabase, userId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(session).where(eq(session.userId, userId));
  return row?.total ?? 0;
}

/** Widerruft alle Sitzungen eines Nutzers (harte Löschung — better-auth erkennt den fehlenden Token beim nächsten Zugriff). */
export async function deleteSessionsForUser(db: AppDatabase, userId: string): Promise<number> {
  const deleted = await db.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
  return deleted.length;
}
