/**
 * Geteilte Ansichtstypen für den Admin-Bereich — dieselbe Rolle wie `types/transaction.ts` für
 * den Wallet-Bereich: `server/admin/*` liefert Werte in genau dieser Form, `components/admin/*`
 * importiert ausschließlich von hier (nie aus `@/server/*`, siehe eslint.config.mjs-Schichtregel
 * „components/ und state/ dürfen nicht aus server/ importieren").
 */

export type AdminSectionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AdminMaskedConnection {
  host: string;
  database: string;
}

export interface AdminMigrationEntry {
  tag: string;
  applied: boolean;
  appliedAtIso: string | null;
}

export interface AdminTableRowCount {
  table: string;
  rowCount: number;
}

export interface AdminLedgerMismatch {
  userId: string;
  walletBalanceMinor: number;
  ledgerSumMinor: number;
  differenceMinor: number;
}

export interface AdminOAuthProviderStatus {
  key: string;
  displayName: string;
  configured: boolean;
}

export interface AdminSystemStatusSnapshot {
  driver: { name: string; description: string };
  maskedConnection: AdminMaskedConnection | null;
  serverVersion: AdminSectionResult<string>;
  migrations: AdminSectionResult<{ applied: AdminMigrationEntry[]; pending: AdminMigrationEntry[] }>;
  tableRowCounts: AdminSectionResult<AdminTableRowCount[]>;
  selectOneLatencyMs: AdminSectionResult<number>;
  integrity: AdminSectionResult<{ checkedWallets: number; mismatches: AdminLedgerMismatch[] }>;
  rateLimit: { active: boolean; trustedProxyRangeCount: number };
  oauthProviders: AdminOAuthProviderStatus[];
}

export type AdminUserRole = "user" | "admin";
export type AdminUserStatus = "active" | "disabled";
export type AdminCatalogStatus = "active" | "inactive";

/** Lesender Ausschnitt der Responsible-Gaming-Einstellungen (Admin-Auftrag §3: nur Einsicht, keine Änderung). */
export interface AdminUserRgSummary {
  selfExcluded: boolean;
  sessionLimitMinutes: number | null;
  pausedUntil: string | null;
}

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  isGuest: boolean;
  createdAt: string;
  roundCount: number;
  rg: AdminUserRgSummary | null;
}

export interface AdminGameModeItem {
  id: string;
  gameId: string;
  label: string;
  status: AdminCatalogStatus;
  sortOrder: number;
  engineKey: string;
  paytableKey: string | null;
}

export interface AdminGameItem {
  id: string;
  slug: string;
  name: string;
  status: AdminCatalogStatus;
  isFeatured: boolean;
  sortOrder: number;
  modes: AdminGameModeItem[];
}

export interface AdminAuditLogEntry {
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
