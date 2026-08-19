// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { gameMode } from "@/server/db/schema";
import { insertLedgerEntry } from "@/server/repositories/ledger-repository";
import { HISTORY_PAGE_SIZE, historySearchParamsSchema, resolveLedgerHistoryPage, resolveRecentLedgerEntries } from "./ledger-history";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

async function seedGameMode(db: TestDatabase, id: string): Promise<void> {
  const { gameId } = await seedMinimalCatalog(db);
  await db.insert(gameMode).values({
    id,
    gameId,
    key: id,
    label: id,
    kind: "variant",
    engineKey: "slot",
    paytableKey: null,
    minBetMinor: 10,
    maxBetMinor: 100_000,
    isDefault: false,
    sortOrder: 0,
    status: "active",
  });
}

describe("historySearchParamsSchema", () => {
  test("akzeptiert leere/fehlende Werte mit sinnvollen Defaults", () => {
    const parsed = historySearchParamsSchema.parse({});
    expect(parsed).toEqual({ range: "all", gameId: undefined, cursors: [] });
  });

  test("verwirft einen ungültigen Zeitraum still auf den Default, statt zu werfen", () => {
    const parsed = historySearchParamsSchema.parse({ range: "invalid-value" });
    expect(parsed.range).toBe("all");
  });

  test("parst eine Komma-Kette gültiger Cursor-Werte", () => {
    expect(historySearchParamsSchema.parse({ cursors: "45,25,6" }).cursors).toEqual([45, 25, 6]);
  });

  test("filtert negative, nicht-numerische oder leere Cursor-Segmente heraus, statt zu werfen", () => {
    expect(historySearchParamsSchema.parse({ cursors: "-5,abc,12" }).cursors).toEqual([12]);
    expect(historySearchParamsSchema.parse({ cursors: "" }).cursors).toEqual([]);
  });
});

describe("resolveLedgerHistoryPage", () => {
  test("Gast ohne Sitzung (userId null): leere Historie, kein Fehler", async () => {
    const db = await createTestDatabase();

    const page = await resolveLedgerHistoryPage(db, null, {});

    expect(page.entries).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.total).toBe(0);
    expect(page.gameOptions).toEqual([]);
  });

  test("keine Einträge: leerer, fehlerfreier Zustand", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const page = await resolveLedgerHistoryPage(db, userId, {});

    expect(page.entries).toEqual([]);
    expect(page.total).toBe(0);
  });

  test("genau eine Seite: alle Einträge, kein nextCursor", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    for (let i = 1; i <= HISTORY_PAGE_SIZE; i++) {
      await insertLedgerEntry(db, { userId, seq: i, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000 });
    }

    const page = await resolveLedgerHistoryPage(db, userId, {});

    expect(page.entries).toHaveLength(HISTORY_PAGE_SIZE);
    expect(page.hasMore).toBe(false);
    expect(page.total).toBe(HISTORY_PAGE_SIZE);
  });

  test("mehrere Seiten: Cursor aus Seite 1 liefert Seite 2 ohne Überschneidung", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    const count = HISTORY_PAGE_SIZE + 5;
    for (let i = 1; i <= count; i++) {
      await insertLedgerEntry(db, { userId, seq: i, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000 });
    }

    const page1 = await resolveLedgerHistoryPage(db, userId, {});
    expect(page1.entries).toHaveLength(HISTORY_PAGE_SIZE);
    expect(page1.hasMore).toBe(true);
    expect(page1.total).toBe(count);

    const page2 = await resolveLedgerHistoryPage(db, userId, { cursor: page1.entries.at(-1)!.seq });
    expect(page2.entries).toHaveLength(5);
    expect(page2.hasMore).toBe(false);
  });

  test("Zeitraum-Filter 'today' schließt ältere Einträge aus", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertLedgerEntry(db, { userId, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    const page = await resolveLedgerHistoryPage(db, userId, { range: "today" });

    // Der gerade eingefügte Eintrag liegt innerhalb der letzten 24 Stunden.
    expect(page.entries).toHaveLength(1);
  });

  test("Spiel-Filter grenzt auf den angegebenen Modus ein und liefert die Liste der vorkommenden Modi", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await seedGameMode(db, "g-neon-nights");
    await insertLedgerEntry(db, { userId, seq: 1, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000, gameModeId: "g-neon-nights" });
    await insertLedgerEntry(db, { userId, seq: 2, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    const page = await resolveLedgerHistoryPage(db, userId, { gameId: "g-neon-nights" });

    expect(page.entries).toHaveLength(1);
    expect(page.gameOptions).toEqual(["g-neon-nights"]);
  });

  test("Autorisierung: liest ausschließlich die Historie der übergebenen userId", async () => {
    const db = await createTestDatabase();
    const userA = await seedUser(db, "user-a");
    const userB = await seedUser(db, "user-b");
    await insertLedgerEntry(db, { userId: userA, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });
    await insertLedgerEntry(db, { userId: userB, seq: 1, type: "credit", amountMinor: 500_000, balanceAfterMinor: 500_000 });

    const page = await resolveLedgerHistoryPage(db, userA, {});

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.userId).toBe(userA);
  });
});

describe("resolveRecentLedgerEntries", () => {
  test("Gast ohne Sitzung: leere Liste, kein Fehler", async () => {
    const db = await createTestDatabase();
    expect(await resolveRecentLedgerEntries(db, null, 10)).toEqual([]);
  });

  test("liefert höchstens `limit` Einträge, neueste zuerst, als Transaction-Form", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    for (let i = 1; i <= 15; i++) {
      await insertLedgerEntry(db, { userId, seq: i, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000 });
    }

    const recent = await resolveRecentLedgerEntries(db, userId, 10);

    expect(recent).toHaveLength(10);
    expect(recent[0]?.seq).toBe(15);
    expect(recent[0]?.type).toBe("bet");
  });
});
