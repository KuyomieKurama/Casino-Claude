// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { insertLedgerEntry, listLedgerEntries, sumLedgerAmountForUser } from "./ledger-repository";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

describe("insertLedgerEntry — Append-only Ledger", () => {
  test("schreibt einen Eintrag und liest ihn zurück", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const entry = await insertLedgerEntry(db, { userId, seq: 1, type: "demo_credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    expect(entry.type).toBe("demo_credit");
    expect(entry.amountMinor).toBe(100_000);
  });

  test("zwei Einträge desselben Nutzers mit derselben seq verletzen den Unique-Index", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertLedgerEntry(db, { userId, seq: 1, type: "demo_credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });

    await expect(insertLedgerEntry(db, { userId, seq: 1, type: "demo_bet", amountMinor: -100, balanceAfterMinor: 99_900 })).rejects.toThrow();
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
    await insertLedgerEntry(db, { userId, seq: 1, type: "demo_credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });
    await insertLedgerEntry(db, { userId, seq: 2, type: "demo_bet", amountMinor: -500, balanceAfterMinor: 99_500 });
    await insertLedgerEntry(db, { userId, seq: 3, type: "demo_win", amountMinor: 1_200, balanceAfterMinor: 100_700 });

    expect(await sumLedgerAmountForUser(db, userId)).toBe(100_700);
  });
});

describe("listLedgerEntries", () => {
  test("liefert Einträge absteigend nach seq", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertLedgerEntry(db, { userId, seq: 1, type: "demo_credit", amountMinor: 100_000, balanceAfterMinor: 100_000 });
    await insertLedgerEntry(db, { userId, seq: 2, type: "demo_bet", amountMinor: -500, balanceAfterMinor: 99_500 });

    const entries = await listLedgerEntries(db, userId);

    expect(entries.map((e) => e.seq)).toEqual([2, 1]);
  });
});
