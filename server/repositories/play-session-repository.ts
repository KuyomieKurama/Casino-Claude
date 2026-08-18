import { and, eq, gte, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { playSession } from "@/server/db/schema";
import { SESSION_GAP_MS } from "@/lib/responsible-gaming";
import { createId } from "@/lib/ids";

/**
 * Repository für `play_session` (Auftrag „Server statt Client", §4): das serverseitige Gegenstück
 * zur früheren 30-Minuten-Lücken-Heuristik aus `state/rg-reducer.ts`, jetzt in
 * `lib/responsible-gaming.ts::SESSION_GAP_MS`. Höchstens eine aktive Sitzung (`ended_at IS NULL`)
 * je Nutzer — der partielle Unique-Index `play_session_user_active_unique` (server/db/schema.ts)
 * ist die Absicherung, nicht nur diese Anwendungslogik.
 */

export interface PlaySessionRecord {
  id: string;
  userId: string;
  startedAt: string;
  lastActiveAt: string;
  endedAt: string | null;
  lastReminderAt: string | null;
}

function toRecord(row: typeof playSession.$inferSelect): PlaySessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    startedAt: row.startedAt.toISOString(),
    lastActiveAt: row.lastActiveAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    lastReminderAt: row.lastReminderAt ? row.lastReminderAt.toISOString() : null,
  };
}

export async function findActiveSession(db: AppDatabase, userId: string): Promise<PlaySessionRecord | null> {
  const [row] = await db
    .select()
    .from(playSession)
    .where(and(eq(playSession.userId, userId), isNull(playSession.endedAt)))
    .limit(1);
  return row ? toRecord(row) : null;
}

async function insertNewActiveSession(db: AppDatabase, userId: string, now: Date): Promise<PlaySessionRecord> {
  const [inserted] = await db
    .insert(playSession)
    .values({ id: createId("ps"), userId, startedAt: now, lastActiveAt: now })
    .onConflictDoNothing()
    .returning();
  if (inserted) return toRecord(inserted);
  // Wettlauf: eine parallele Anfrage hat zwischen dem Schließen oben und diesem INSERT bereits
  // eine neue aktive Sitzung angelegt (partieller Unique-Index greift). Kein Fehler — die gerade
  // entstandene Sitzung IST die korrekte Antwort für „jetzt aktiv".
  const existing = await findActiveSession(db, userId);
  if (!existing) {
    throw new Error(`Spielsitzung für Nutzer „${userId}" konnte nach Konflikt nicht gelesen werden.`);
  }
  return existing;
}

/**
 * Schreibt Aktivität fort ODER beginnt eine neue Sitzung, je nach Lücke seit `lastActiveAt` —
 * dieselbe Regel wie früher `state/rg-reducer.ts::HYDRATE`. Jeder Aufruf ZÄHLT als Aktivität
 * (Rundenstart, RG-Einstellungsänderung, periodischer Heartbeat vom Client), unabhängig vom
 * RG-Blockierungsstatus: ob eine Anfrage abgelehnt wird, entscheidet `server/rg/rg-guard.ts`
 * NACH diesem Aufruf — das reine Anfragen zählt bereits als „die Sitzung läuft weiter".
 */
export async function touchPlaySession(db: AppDatabase, userId: string, nowIso: string): Promise<PlaySessionRecord> {
  const now = new Date(nowIso);
  const earliestContinuable = new Date(now.getTime() - SESSION_GAP_MS);

  const [continued] = await db
    .update(playSession)
    .set({ lastActiveAt: now })
    .where(and(eq(playSession.userId, userId), isNull(playSession.endedAt), gte(playSession.lastActiveAt, earliestContinuable)))
    .returning();
  if (continued) return toRecord(continued);

  // Keine fortsetzbare Sitzung: eine evtl. noch offene, aber zu lange inaktive Sitzung schließen
  // — `ended_at` bekommt ihren eigenen letzten Aktivitätsstempel, nicht `now` (der tatsächliche
  // Zeitpunkt, an dem die Aktivität aufhörte, nicht der Zeitpunkt der Wiederkehr).
  await db
    .update(playSession)
    .set({ endedAt: playSession.lastActiveAt })
    .where(and(eq(playSession.userId, userId), isNull(playSession.endedAt)));

  return insertNewActiveSession(db, userId, now);
}

/** Erzwingt eine neue Sitzung unabhängig von der Lücke — Server-Gegenstück zu START_NEW_SESSION. */
export async function forceNewSession(db: AppDatabase, userId: string, nowIso: string): Promise<PlaySessionRecord> {
  const now = new Date(nowIso);
  await db
    .update(playSession)
    .set({ endedAt: now })
    .where(and(eq(playSession.userId, userId), isNull(playSession.endedAt)));
  return insertNewActiveSession(db, userId, now);
}

export async function markReminderShown(db: AppDatabase, userId: string, nowIso: string): Promise<PlaySessionRecord | null> {
  const [row] = await db
    .update(playSession)
    .set({ lastReminderAt: new Date(nowIso) })
    .where(and(eq(playSession.userId, userId), isNull(playSession.endedAt)))
    .returning();
  return row ? toRecord(row) : null;
}
