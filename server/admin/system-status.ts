import { sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import type { AppDatabase } from "@/server/db/types";
import { getOAuthProviderStatuses, type OAuthProviderStatus } from "@/server/auth/providers";
import { adminAuditLog, game, gameMode, gameRound, gameRoundAction, ledgerEntry, playSession, provider, rgSetting, wallet } from "@/server/db/schema";
import { loginAttempt, session, user } from "@/server/db/auth-schema";

/**
 * Systemstatus/Datenbankdiagnose (Admin-Auftrag §1). Reine Lesevorgänge — KEIN Umschalten der
 * Datenbank, kein Verbindungsstring-Eingabefeld (siehe Auftrag: „das wäre eine SSRF-Primitive").
 *
 * Jeder Abschnitt liefert ein `SectionResult<T>` statt zu werfen: ein einzelner fehlschlagender
 * Teil (z. B. `SELECT version()` ohne Berechtigung) soll nicht die gesamte Diagnoseseite mit
 * einem Stacktrace abreißen lassen (CLAUDE.md: Fehlermeldungen „ohne Stacktrace"). Die Nachricht
 * in `error` ist die `Error.message` — bei PostgreSQL-Fehlern bereits eine kurze, technische aber
 * stacktrace-freie Beschreibung.
 */
export type SectionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): SectionResult<T> {
  return { ok: true, data };
}

function fail<T>(error: unknown): SectionResult<T> {
  return { ok: false, error: error instanceof Error ? error.message : "Unbekannter Fehler bei der Diagnoseabfrage." };
}

async function resolveSection<T>(run: () => Promise<T>): Promise<SectionResult<T>> {
  try {
    return ok(await run());
  } catch (error) {
    return fail(error);
  }
}

export interface MaskedConnectionInfo {
  host: string;
  database: string;
}

/**
 * Maskiert einen Verbindungsstring auf Host und Datenbankname (Admin-Auftrag §1: „nur Host und
 * Datenbankname, niemals Benutzer oder Passwort"). `URL` liest Nutzername/Passwort zwar ein
 * (`username`/`password`), diese Funktion greift auf diese Felder an KEINER Stelle zu — sie
 * existieren nur im geparsten `URL`-Objekt, das diese Funktion nie zurückgibt oder loggt.
 */
export function maskConnectionString(rawUrl: string): MaskedConnectionInfo | null {
  try {
    const parsed = new URL(rawUrl);
    const database = parsed.pathname.replace(/^\//, "");
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    return { host, database };
  } catch {
    return null;
  }
}

export interface RateLimitStatus {
  active: boolean;
  trustedProxyRangeCount: number;
}

/** Deckt sich mit server/auth/rate-limit-plugin.ts: IP-Rate-Limiting ist nur mit mindestens einem konfigurierten Bereich aktiv. */
export function resolveRateLimitStatus(trustedProxyIps: readonly string[]): RateLimitStatus {
  return { active: trustedProxyIps.length > 0, trustedProxyRangeCount: trustedProxyIps.length };
}

export interface TableRowCount {
  table: string;
  rowCount: number;
}

/** Alle im Auftrag namentlich genannten Tabellen, in derselben Reihenfolge. */
const MONITORED_TABLES: readonly { name: string; table: PgTable }[] = [
  { name: "game", table: game },
  { name: "game_mode", table: gameMode },
  { name: "provider", table: provider },
  { name: "user", table: user },
  { name: "session", table: session },
  { name: "wallet", table: wallet },
  { name: "ledger_entry", table: ledgerEntry },
  { name: "game_round", table: gameRound },
  { name: "game_round_action", table: gameRoundAction },
  { name: "rg_setting", table: rgSetting },
  { name: "play_session", table: playSession },
  { name: "login_attempt", table: loginAttempt },
  { name: "admin_audit_log", table: adminAuditLog },
];

/**
 * Rohes SQL über `AppDatabase` (treiberunabhängig, siehe server/db/types.ts) liefert laut
 * Drizzle-Typdefinition (`PgQueryResultKind<PgQueryResultHKT, TRow>`) `unknown` zurück — die
 * konkrete Zeilenform hängt vom tatsächlichen Treiber ab (pg vs. PGlite), den `AppDatabase`
 * bewusst nicht kennt. Beide konkreten Treiber liefern zur Laufzeit nachweislich `{ rows, fields
 * }` (geprüft gegen PGlite in server/admin/system-status.test.ts und gegen `pg` in
 * server/db/migration.test.ts-artigen Läufen) — diese eine Stelle bündelt die dafür nötige
 * Typzusicherung, statt sie an jeder Aufrufstelle zu wiederholen.
 */
async function executeRaw<TRow extends Record<string, unknown>>(db: AppDatabase, query: SQL): Promise<{ rows: TRow[] }> {
  const result = await db.execute(query);
  return result as { rows: TRow[] };
}

async function countRows(db: AppDatabase, table: PgTable): Promise<number> {
  const [row] = await db.select({ total: sql<string>`count(*)` }).from(table);
  return Number(row?.total ?? 0);
}

export async function resolveTableRowCounts(db: AppDatabase): Promise<TableRowCount[]> {
  return Promise.all(MONITORED_TABLES.map(async ({ name, table }) => ({ table: name, rowCount: await countRows(db, table) })));
}

export interface MigrationStatusEntry {
  tag: string;
  applied: boolean;
  appliedAtIso: string | null;
}

export interface MigrationStatus {
  applied: MigrationStatusEntry[];
  pending: MigrationStatusEntry[];
}

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

// `& Record<string, unknown>` erfüllt die Generic-Constraint von `db.execute<TRow>()`
// (drizzle-orm/pg-core/db.d.ts: `TRow extends Record<string, unknown>`) — ein reines Interface
// ohne Indexsignatur erfüllt diese Constraint sonst nicht, obwohl strukturell kompatibel.
type DrizzleMigrationRow = { id: number; hash: string; created_at: number } & Record<string, unknown>;

/**
 * Migrationsstand (Admin-Auftrag §1: „angewendet und ausstehend"). Vergleicht die generierten
 * Migrationsdateien (`server/db/migrations/meta/_journal.json`, dieselbe Liste, die `drizzle-kit
 * migrate` selbst abarbeitet) mit den tatsächlich in `drizzle.__drizzle_migrations`
 * protokollierten Anwendungen. Migrationen laufen strikt in Reihenfolge (drizzle-kit verweigert
 * Lücken) — deshalb genügt ein Vergleich der ANZAHL angewendeter Zeilen mit dem Index in der
 * Journal-Liste, ohne die Hash-Werte selbst abzugleichen.
 */
export async function resolveMigrationStatus(db: AppDatabase): Promise<MigrationStatus> {
  const journalPath = path.join(process.cwd(), "server/db/migrations/meta/_journal.json");
  const journalRaw = await readFile(journalPath, "utf-8");
  const journal = JSON.parse(journalRaw) as { entries: JournalEntry[] };

  const result = await executeRaw<DrizzleMigrationRow>(db, sql`select id, hash, created_at from drizzle.__drizzle_migrations order by id`);
  const appliedRows = [...result.rows].sort((a, b) => a.id - b.id);

  const entries: MigrationStatusEntry[] = journal.entries
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((entry, index) => {
      const appliedRow = appliedRows[index];
      return {
        tag: entry.tag,
        applied: appliedRow !== undefined,
        appliedAtIso: appliedRow !== undefined ? new Date(appliedRow.created_at).toISOString() : null,
      };
    });

  return { applied: entries.filter((e) => e.applied), pending: entries.filter((e) => !e.applied) };
}

export interface LedgerIntegrityMismatch {
  userId: string;
  walletBalanceMinor: number;
  ledgerSumMinor: number;
  differenceMinor: number;
}

export interface IntegrityCheckResult {
  checkedWallets: number;
  mismatches: LedgerIntegrityMismatch[];
}

/**
 * Serverseitige Fassung der Invariante „Saldo entspricht der Transaktionskette" (Admin-Auftrag
 * §1, siehe auch server/db/schema.ts::wallet-Kommentar und die Konsistenztests in
 * server/wallet/wallet-read-model.test.ts / server/rounds/round-service.test.ts): für jeden
 * Nutzer mit einem Wallet muss `balance_minor + bonus_balance_minor` exakt der Summe aller
 * `ledger_entry.amount_minor`-Zeilen entsprechen. Eine einzelne aggregierte Abfrage (LEFT JOIN +
 * GROUP BY) statt einer Schleife über alle Nutzer — kein N+1.
 */
export async function resolveIntegrityCheck(db: AppDatabase): Promise<IntegrityCheckResult> {
  const rows = await executeRaw<{ user_id: string; wallet_balance_minor: string; ledger_sum_minor: string } & Record<string, unknown>>(db, sql`
    select
      w.user_id as user_id,
      (w.balance_minor + w.bonus_balance_minor) as wallet_balance_minor,
      coalesce(sum(l.amount_minor), 0) as ledger_sum_minor
    from wallet w
    left join ledger_entry l on l.user_id = w.user_id
    group by w.user_id, w.balance_minor, w.bonus_balance_minor
  `);

  const mismatches: LedgerIntegrityMismatch[] = [];
  for (const row of rows.rows) {
    const walletBalanceMinor = Number(row.wallet_balance_minor);
    const ledgerSumMinor = Number(row.ledger_sum_minor);
    if (walletBalanceMinor !== ledgerSumMinor) {
      mismatches.push({ userId: row.user_id, walletBalanceMinor, ledgerSumMinor, differenceMinor: walletBalanceMinor - ledgerSumMinor });
    }
  }

  return { checkedWallets: rows.rows.length, mismatches };
}

export interface SystemStatusSnapshot {
  driver: { name: string; description: string };
  maskedConnection: MaskedConnectionInfo | null;
  serverVersion: SectionResult<string>;
  migrations: SectionResult<MigrationStatus>;
  tableRowCounts: SectionResult<TableRowCount[]>;
  selectOneLatencyMs: SectionResult<number>;
  integrity: SectionResult<IntegrityCheckResult>;
  rateLimit: RateLimitStatus;
  oauthProviders: OAuthProviderStatus[];
}

/** Gesamter Diagnose-Snapshot für app/admin/page.tsx — eine Funktion, ein Aufruf pro Seitenaufbau. */
export async function resolveSystemStatus(db: AppDatabase): Promise<SystemStatusSnapshot> {
  const [serverVersion, migrations, tableRowCounts, selectOneLatencyMs, integrity] = await Promise.all([
    resolveSection(async () => {
      const result = await executeRaw<{ version: string } & Record<string, unknown>>(db, sql`select version()`);
      const versionRow = result.rows[0];
      if (!versionRow) throw new Error("SELECT version() lieferte keine Zeile.");
      return versionRow.version;
    }),
    resolveSection(() => resolveMigrationStatus(db)),
    resolveSection(() => resolveTableRowCounts(db)),
    resolveSection(async () => {
      const startedAt = performance.now();
      await db.execute(sql`select 1`);
      return Math.round((performance.now() - startedAt) * 100) / 100;
    }),
    resolveSection(() => resolveIntegrityCheck(db)),
  ]);

  return {
    driver: { name: "PostgreSQL", description: "über drizzle-orm/node-postgres (pg-Treiber)" },
    maskedConnection: maskConnectionString(env.DATABASE_URL),
    serverVersion,
    migrations,
    tableRowCounts,
    selectOneLatencyMs,
    integrity,
    rateLimit: resolveRateLimitStatus(env.TRUSTED_PROXY_IPS),
    oauthProviders: getOAuthProviderStatuses(),
  };
}
