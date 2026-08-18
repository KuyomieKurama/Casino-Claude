import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { rgSetting } from "@/server/db/schema";
import { DEFAULT_REMINDER_INTERVAL_MINUTES } from "@/lib/constants";

/**
 * Repository für `rg_setting` (Auftrag „Server statt Client", §1/§3). Jede Schreiboperation ist
 * ein atomarer `INSERT ... ON CONFLICT (user_id) DO UPDATE` — dieselbe Zeile wird bei Bedarf mit
 * Standardwerten angelegt UND im selben Schritt geändert, kein Lesen-dann-Schreiben (dasselbe
 * Muster wie `server/repositories/wallet-repository.ts`). Jede Funktion nimmt `userId` als
 * eigenen Parameter entgegen und baut die WHERE/ON-CONFLICT-Bedingung selbst daraus — kein
 * Aufrufer kann eine `userId` aus einem Request-Body durchreichen, ohne dass sie hier ausdrücklich
 * als Parameter auftaucht (Auftrag §3: „Ein Repository darf niemals eine `userId` aus der Anfrage
 * übernehmen").
 */

export interface RgSettingsRecord {
  userId: string;
  sessionLimitMinutes: number | null;
  reminderIntervalMinutes: number;
  pausedUntil: string | null;
  selfExcluded: boolean;
  selfExcludedAt: string | null;
  liftRequestedAt: string | null;
  updatedAt: string;
}

function toRecord(row: typeof rgSetting.$inferSelect): RgSettingsRecord {
  return {
    userId: row.userId,
    sessionLimitMinutes: row.sessionLimitMinutes,
    reminderIntervalMinutes: row.reminderIntervalMinutes,
    pausedUntil: row.pausedUntil ? row.pausedUntil.toISOString() : null,
    selfExcluded: row.selfExcluded,
    selfExcludedAt: row.selfExcludedAt ? row.selfExcludedAt.toISOString() : null,
    liftRequestedAt: row.liftRequestedAt ? row.liftRequestedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const defaults = { reminderIntervalMinutes: DEFAULT_REMINDER_INTERVAL_MINUTES, selfExcluded: false };

/**
 * `INSERT ... ON CONFLICT DO UPDATE` liefert bei EINER Zielzeile (hier: PK `user_id`) immer genau
 * eine Zeile zurück — TypeScript kennt diese Garantie aber nicht (`.returning()` ist generisch als
 * `T[]` typisiert). Kein stiller Fallback bei einer fehlenden Zeile: ein leeres Ergebnis wäre ein
 * Programmierfehler (z. B. ein falscher Konfliktziel-Parameter), kein erwarteter Nutzerzustand.
 */
function requireRow<T>(row: T | undefined, userId: string): T {
  if (!row) throw new Error(`Responsible-Gaming-Einstellungen für Nutzer „${userId}" konnten nicht geschrieben werden (kein Upsert-Ergebnis).`);
  return row;
}

export async function findRgSettings(db: AppDatabase, userId: string): Promise<RgSettingsRecord | null> {
  const [row] = await db.select().from(rgSetting).where(eq(rgSetting.userId, userId)).limit(1);
  return row ? toRecord(row) : null;
}

/** Legt bei Bedarf eine Standardzeile an (keine Sperre, kein Limit) — ändert nichts an einer bestehenden. */
export async function findOrCreateRgSettings(db: AppDatabase, userId: string): Promise<RgSettingsRecord> {
  const [row] = await db
    .insert(rgSetting)
    .values({ userId, ...defaults })
    .onConflictDoNothing({ target: rgSetting.userId })
    .returning();
  if (row) return toRecord(row);
  const existing = await findRgSettings(db, userId);
  if (!existing) {
    throw new Error(`Responsible-Gaming-Einstellungen für Nutzer „${userId}" konnten nach Konflikt nicht gelesen werden.`);
  }
  return existing;
}

export async function setPause(db: AppDatabase, userId: string, pausedUntilIso: string): Promise<RgSettingsRecord> {
  const pausedUntil = new Date(pausedUntilIso);
  const [row] = await db
    .insert(rgSetting)
    .values({ userId, ...defaults, pausedUntil })
    .onConflictDoUpdate({ target: rgSetting.userId, set: { pausedUntil, updatedAt: new Date() } })
    .returning();
  return toRecord(requireRow(row, userId));
}

export async function endPause(db: AppDatabase, userId: string): Promise<RgSettingsRecord> {
  const [row] = await db
    .insert(rgSetting)
    .values({ userId, ...defaults, pausedUntil: null })
    .onConflictDoUpdate({ target: rgSetting.userId, set: { pausedUntil: null, updatedAt: new Date() } })
    .returning();
  return toRecord(requireRow(row, userId));
}

export async function setSessionLimitMinutes(db: AppDatabase, userId: string, minutes: number | null): Promise<RgSettingsRecord> {
  const [row] = await db
    .insert(rgSetting)
    .values({ userId, ...defaults, sessionLimitMinutes: minutes })
    .onConflictDoUpdate({ target: rgSetting.userId, set: { sessionLimitMinutes: minutes, updatedAt: new Date() } })
    .returning();
  return toRecord(requireRow(row, userId));
}

export async function setReminderIntervalMinutes(db: AppDatabase, userId: string, minutes: number): Promise<RgSettingsRecord> {
  const [row] = await db
    .insert(rgSetting)
    .values({ userId, ...defaults, reminderIntervalMinutes: minutes })
    .onConflictDoUpdate({ target: rgSetting.userId, set: { reminderIntervalMinutes: minutes, updatedAt: new Date() } })
    .returning();
  return toRecord(requireRow(row, userId));
}

/**
 * Aktiviert die Selbstsperre — wirkt sofort (Auftrag §3): ein einziger Aufruf genügt, anders als
 * beim Aufheben (siehe `requestLiftSelfExclusion`/`confirmLiftSelfExclusion` unten). Ein evtl.
 * offener Aufhebungsantrag wird verworfen (`liftRequestedAt: null`) — eine erneute Sperre macht
 * einen vorherigen Aufhebungsversuch ungültig.
 */
export async function activateSelfExclusion(db: AppDatabase, userId: string, nowIso: string): Promise<RgSettingsRecord> {
  const now = new Date(nowIso);
  const [row] = await db
    .insert(rgSetting)
    .values({ userId, ...defaults, selfExcluded: true, selfExcludedAt: now, liftRequestedAt: null })
    .onConflictDoUpdate({ target: rgSetting.userId, set: { selfExcluded: true, selfExcludedAt: now, liftRequestedAt: null, updatedAt: now } })
    .returning();
  return toRecord(requireRow(row, userId));
}

/**
 * Schritt 1 des Zwei-Schritt-Aufhebens (Auftrag §3): merkt sich nur den Zeitpunkt der Anfrage.
 * Ändert `selfExcluded` NICHT — die Sperre bleibt bis zu einem separaten, anschließenden
 * `confirmLiftSelfExclusion`-Aufruf wirksam. Ohne bestehende Sperre gibt es nichts aufzuheben:
 * `null` signalisiert das, statt stillschweigend eine Zeile mit einem sinnlosen Antrag anzulegen.
 */
export async function requestLiftSelfExclusion(db: AppDatabase, userId: string, nowIso: string): Promise<RgSettingsRecord | null> {
  const [row] = await db
    .update(rgSetting)
    .set({ liftRequestedAt: new Date(nowIso), updatedAt: new Date(nowIso) })
    .where(eq(rgSetting.userId, userId))
    .returning();
  if (!row || !row.selfExcluded) return null;
  return toRecord(row);
}

/**
 * Schritt 2 (der eigentliche Schutz, Auftrag §3/Tests: „lässt sich nicht mit einem einzelnen
 * Aufruf aufheben"): setzt `selfExcluded` NUR zurück, wenn ein `requestLiftSelfExclusion`-Aufruf
 * innerhalb von `windowMs` vorausging — geprüft direkt in der WHERE-Bedingung des UPDATEs, gegen
 * den Datenbankstand, nicht gegen einen vom Client behaupteten Wert. Ein isolierter Aufruf dieser
 * Funktion (kein vorheriger `requestLift`, oder das Fenster ist abgelaufen) trifft auf `liftRequestedAt
 * IS NULL` bzw. eine zu alte Zeit und bewirkt NICHTS — `null` zeigt das an.
 */
export async function confirmLiftSelfExclusion(db: AppDatabase, userId: string, nowIso: string, windowMs: number): Promise<RgSettingsRecord | null> {
  const now = new Date(nowIso);
  const earliestValidRequest = new Date(now.getTime() - windowMs);
  const [row] = await db
    .update(rgSetting)
    .set({ selfExcluded: false, selfExcludedAt: null, liftRequestedAt: null, updatedAt: now })
    .where(
      and(
        eq(rgSetting.userId, userId),
        eq(rgSetting.selfExcluded, true),
        isNotNull(rgSetting.liftRequestedAt),
        gte(rgSetting.liftRequestedAt, earliestValidRequest),
      ),
    )
    .returning();
  return row ? toRecord(row) : null;
}
