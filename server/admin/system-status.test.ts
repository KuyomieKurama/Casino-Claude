// @vitest-environment node
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

/** lib/env.ts importiert "server-only" — außerhalb von Next.js wirft das immer, siehe lib/env.test.ts. */
vi.mock("server-only", () => ({}));
import { createTestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { wallet } from "@/server/db/schema";
import { insertWalletIfMissing } from "@/server/repositories/wallet-repository";
import { insertLedgerEntry } from "@/server/repositories/ledger-repository";
import { maskConnectionString, resolveIntegrityCheck, resolveMigrationStatus, resolveRateLimitStatus, resolveSystemStatus, resolveTableRowCounts } from "./system-status";

describe("maskConnectionString — Admin-Auftrag §1 (nie Benutzer/Passwort)", () => {
  test("liefert nur Host und Datenbankname aus einer vollständigen Verbindung", () => {
    const masked = maskConnectionString("postgresql://velora:geheim@db.example.com:5432/velora_prod");
    expect(masked).toEqual({ host: "db.example.com:5432", database: "velora_prod" });
  });

  test("das Ergebnis enthält an keiner Stelle Benutzername oder Passwort", () => {
    const masked = maskConnectionString("postgresql://super-secret-user:super-secret-password@localhost:5432/velora");
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain("super-secret-user");
    expect(serialized).not.toContain("super-secret-password");
  });

  test("eine ungültige URL liefert null statt zu werfen", () => {
    expect(maskConnectionString("nicht-valide")).toBeNull();
  });
});

describe("resolveRateLimitStatus", () => {
  test("inaktiv ohne TRUSTED_PROXY_IPS", () => {
    expect(resolveRateLimitStatus([])).toEqual({ active: false, trustedProxyRangeCount: 0 });
  });

  test("aktiv mit mindestens einem Eintrag", () => {
    expect(resolveRateLimitStatus(["10.0.0.0/8"])).toEqual({ active: true, trustedProxyRangeCount: 1 });
  });
});

describe("resolveTableRowCounts", () => {
  test("zählt Zeilen je überwachter Tabelle", async () => {
    const db = await createTestDatabase();
    await db.insert(user).values({ id: "u1", name: "A", email: "a@example.com" });
    await db.insert(user).values({ id: "u2", name: "B", email: "b@example.com" });

    const counts = await resolveTableRowCounts(db);
    const userCount = counts.find((c) => c.table === "user");
    expect(userCount?.rowCount).toBe(2);
    // Alle in der Kontextliste genannten Tabellen sind vertreten.
    for (const name of ["game", "game_mode", "provider", "user", "session", "wallet", "ledger_entry", "game_round", "game_round_action", "rg_setting", "play_session", "login_attempt", "admin_audit_log"]) {
      expect(counts.some((c) => c.table === name)).toBe(true);
    }
  });
});

describe("resolveMigrationStatus", () => {
  test("alle über die echten Migrationsdateien angewendeten Migrationen gelten als angewendet, keine ausstehend", async () => {
    const db = await createTestDatabase();

    const status = await resolveMigrationStatus(db);

    expect(status.applied.length).toBeGreaterThan(0);
    expect(status.pending).toHaveLength(0);
    expect(status.applied.every((m) => m.applied)).toBe(true);
  });
});

describe("resolveIntegrityCheck — Admin-Auftrag §1 (Ledger-Summe gegen materialisierten Saldo)", () => {
  test("keine Abweichung bei einem konsistenten Wallet", async () => {
    const db = await createTestDatabase();
    await db.insert(user).values({ id: "u1", name: "A", email: "a@example.com" });
    const { walletRecord } = await insertWalletIfMissing(db, "u1", 100_000);
    await insertLedgerEntry(db, { userId: "u1", seq: 1, type: "demo_credit", amountMinor: 100_000, balanceAfterMinor: walletRecord.demoBalanceMinor });

    const result = await resolveIntegrityCheck(db);

    expect(result.checkedWallets).toBe(1);
    expect(result.mismatches).toHaveLength(0);
  });

  test("erkennt eine künstlich erzeugte Abweichung (Wallet-Saldo ohne passende Ledger-Buchung manipuliert)", async () => {
    const db = await createTestDatabase();
    await db.insert(user).values({ id: "u1", name: "A", email: "a@example.com" });
    await insertWalletIfMissing(db, "u1", 100_000);
    await insertLedgerEntry(db, { userId: "u1", seq: 1, type: "demo_credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    // Manipulation direkt an der Wallet-Tabelle vorbei am Ledger — genau der Fall, den die
    // Integritätsprüfung aufdecken soll (z. B. ein Bug, der den Saldo ohne Buchung ändert).
    await db.update(wallet).set({ demoBalanceMinor: 999_999 }).where(eq(wallet.userId, "u1"));

    const result = await resolveIntegrityCheck(db);

    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toMatchObject({ userId: "u1", walletBalanceMinor: 999_999, ledgerSumMinor: 100_000, differenceMinor: 999_999 - 100_000 });
  });
});

describe("resolveSystemStatus — zusammengesetzter Snapshot", () => {
  test("liefert alle Abschnitte ohne zu werfen, auch wenn einzelne Abfragen scheitern könnten", async () => {
    const db = await createTestDatabase();

    const status = await resolveSystemStatus(db);

    expect(status.driver.name).toContain("PostgreSQL");
    expect(status.serverVersion.ok).toBe(true);
    if (status.serverVersion.ok) expect(status.serverVersion.data).toContain("PostgreSQL");
    expect(status.migrations.ok).toBe(true);
    expect(status.tableRowCounts.ok).toBe(true);
    expect(status.selectOneLatencyMs.ok).toBe(true);
    if (status.selectOneLatencyMs.ok) expect(status.selectOneLatencyMs.data).toBeGreaterThanOrEqual(0);
    expect(status.integrity.ok).toBe(true);
    expect(status.rateLimit).toEqual({ active: false, trustedProxyRangeCount: 0 });
    expect(status.oauthProviders).toHaveLength(3);
    for (const provider of status.oauthProviders) {
      expect(provider).not.toHaveProperty("clientSecret");
    }
  });
});
