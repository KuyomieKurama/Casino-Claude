// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { gameMode } from "@/server/db/schema";
import {
  countLedgerEntries,
  insertLedgerEntry,
  listDistinctGameModeIds,
  listLedgerEntries,
  listLedgerEntriesPage,
  sumLedgerAmountForUser,
} from "./ledger-repository";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

/** ledger_entry.game_mode_id trägt einen Fremdschlüssel auf game_mode — für Tests, die einen
 *  Spielmodus-Filter prüfen, wird hier ein minimaler, gültiger Modus je ID angelegt. */
async function seedGameModes(db: TestDatabase, ids: readonly string[]): Promise<void> {
  const { gameId } = await seedMinimalCatalog(db);
  for (const id of ids) {
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
}

describe("insertLedgerEntry — Append-only Ledger", () => {
  test("schreibt einen Eintrag und liest ihn zurück", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const entry = await insertLedgerEntry(db, { userId, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    expect(entry.type).toBe("credit");
    expect(entry.amountMinor).toBe(100_000);
  });

  test("zwei Einträge desselben Nutzers mit derselben seq verletzen den Unique-Index", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertLedgerEntry(db, { userId, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    await expect(insertLedgerEntry(db, { userId, seq: 1, type: "bet", amountMinor: -100, balanceAfterMinor: 99_900 })).rejects.toThrow();
  });
});

describe("sumLedgerAmountForUser — Konsistenz (Auftrag §8)", () => {
  test("liefert 0 ohne Einträge", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    expect(await sumLedgerAmountForUser(db, userId)).toBe(0);
  });

  test("summiert Einsätze (negativ) und Gutschriften (positiv) korrekt", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertLedgerEntry(db, { userId, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });
    await insertLedgerEntry(db, { userId, seq: 2, type: "bet", amountMinor: -500, balanceAfterMinor: 99_500 });
    await insertLedgerEntry(db, { userId, seq: 3, type: "win", amountMinor: 1_200, balanceAfterMinor: 100_700 });

    expect(await sumLedgerAmountForUser(db, userId)).toBe(100_700);
  });
});

describe("listLedgerEntries", () => {
  test("liefert Einträge absteigend nach seq", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertLedgerEntry(db, { userId, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });
    await insertLedgerEntry(db, { userId, seq: 2, type: "bet", amountMinor: -500, balanceAfterMinor: 99_500 });

    const entries = await listLedgerEntries(db, userId);

    expect(entries.map((e) => e.seq)).toEqual([2, 1]);
  });
});

/** Auftrag §2 (Historie): Blätterung per Keyset (seq), niemals eine unbegrenzte Abfrage. */
describe("listLedgerEntriesPage — Paginierung", () => {
  async function seedEntries(db: TestDatabase, userId: string, count: number, gameModeId?: string) {
    for (let i = 1; i <= count; i++) {
      await insertLedgerEntry(db, {
        userId,
        seq: i,
        type: i % 2 === 0 ? "win" : "bet",
        amountMinor: i % 2 === 0 ? 100 : -100,
        balanceAfterMinor: 100_000,
        ...(gameModeId ? { gameModeId } : {}),
      });
    }
  }

  test("keine Einträge: leere Seite, hasMore false", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const page = await listLedgerEntriesPage(db, userId, { limit: 20 });

    expect(page.entries).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  test("genau eine Seite: alle Einträge auf einer Seite, hasMore false", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await seedEntries(db, userId, 20);

    const page = await listLedgerEntriesPage(db, userId, { limit: 20 });

    expect(page.entries).toHaveLength(20);
    expect(page.hasMore).toBe(false);
    expect(page.entries.map((e) => e.seq)).toEqual(Array.from({ length: 20 }, (_, i) => 20 - i));
  });

  test("mehrere Seiten: erste Seite meldet hasMore, Cursor liefert die nächste Seite ohne Überschneidung", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await seedEntries(db, userId, 45);

    const firstPage = await listLedgerEntriesPage(db, userId, { limit: 20 });
    expect(firstPage.entries).toHaveLength(20);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.entries[0]?.seq).toBe(45);
    expect(firstPage.entries.at(-1)?.seq).toBe(26);

    const secondPage = await listLedgerEntriesPage(db, userId, { limit: 20, beforeSeq: firstPage.entries.at(-1)!.seq });
    expect(secondPage.entries).toHaveLength(20);
    expect(secondPage.hasMore).toBe(true);
    expect(secondPage.entries[0]?.seq).toBe(25);
    expect(secondPage.entries.at(-1)?.seq).toBe(6);

    const thirdPage = await listLedgerEntriesPage(db, userId, { limit: 20, beforeSeq: secondPage.entries.at(-1)!.seq });
    expect(thirdPage.entries).toHaveLength(5);
    expect(thirdPage.hasMore).toBe(false);

    // Keine Dopplung über die Seiten hinweg
    const allSeqs = [...firstPage.entries, ...secondPage.entries, ...thirdPage.entries].map((e) => e.seq);
    expect(new Set(allSeqs).size).toBe(45);
  });

  test("filtert nach Spielmodus, ohne die Reihenfolge zu ändern", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await seedGameModes(db, ["g-neon-nights", "g-other"]);
    await seedEntries(db, userId, 5, "g-neon-nights");
    await insertLedgerEntry(db, { userId, seq: 6, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000, gameModeId: "g-other" });

    const page = await listLedgerEntriesPage(db, userId, { limit: 20, gameModeId: "g-neon-nights" });

    expect(page.entries).toHaveLength(5);
    expect(page.entries.every((e) => e.gameModeId === "g-neon-nights")).toBe(true);
  });

  test("filtert nach Zeitraum (createdAfter)", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertLedgerEntry(db, { userId, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    const future = new Date(Date.now() + 3_600_000).toISOString();
    const page = await listLedgerEntriesPage(db, userId, { limit: 20, createdAfterIso: future });

    expect(page.entries).toEqual([]);
  });

  test("Autorisierung: liefert ausschließlich Einträge des angefragten Nutzers", async () => {
    const db = await createTestDatabase();
    const userA = await seedUser(db, "user-a");
    const userB = await seedUser(db, "user-b");
    await insertLedgerEntry(db, { userId: userA, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });
    await insertLedgerEntry(db, { userId: userB, seq: 1, type: "credit", amountMinor: 200_000, balanceAfterMinor: 200_000 });

    const page = await listLedgerEntriesPage(db, userA, { limit: 20 });

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.userId).toBe(userA);
  });
});

describe("countLedgerEntries", () => {
  test("zählt Einträge des Nutzers, ohne alle Zeilen zu laden", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertLedgerEntry(db, { userId, seq: 1, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });
    await insertLedgerEntry(db, { userId, seq: 2, type: "bet", amountMinor: -100, balanceAfterMinor: 99_900 });

    expect(await countLedgerEntries(db, userId, {})).toBe(2);
  });

  test("berücksichtigt denselben Spielmodus-Filter wie listLedgerEntriesPage", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await seedGameModes(db, ["g-a", "g-b"]);
    await insertLedgerEntry(db, { userId, seq: 1, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000, gameModeId: "g-a" });
    await insertLedgerEntry(db, { userId, seq: 2, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000, gameModeId: "g-b" });

    expect(await countLedgerEntries(db, userId, { gameModeId: "g-a" })).toBe(1);
  });
});

describe("listDistinctGameModeIds", () => {
  test("liefert jeden Spielmodus des Nutzers genau einmal", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await seedGameModes(db, ["g-a", "g-b"]);
    await insertLedgerEntry(db, { userId, seq: 1, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000, gameModeId: "g-a" });
    await insertLedgerEntry(db, { userId, seq: 2, type: "win", amountMinor: 100, balanceAfterMinor: 100_000, gameModeId: "g-a" });
    await insertLedgerEntry(db, { userId, seq: 3, type: "bet", amountMinor: -100, balanceAfterMinor: 100_000, gameModeId: "g-b" });
    await insertLedgerEntry(db, { userId, seq: 4, type: "credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    const ids = await listDistinctGameModeIds(db, userId);

    expect(ids.sort()).toEqual(["g-a", "g-b"]);
  });
});
