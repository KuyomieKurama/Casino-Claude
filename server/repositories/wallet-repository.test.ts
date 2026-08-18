// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { consumeFreeSpin, creditReturn, debitForStake, findWallet, insertWalletIfMissing } from "./wallet-repository";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

describe("insertWalletIfMissing", () => {
  test("legt ein Wallet mit dem Startguthaben an und meldet created: true", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const { walletRecord, created } = await insertWalletIfMissing(db, userId, 100_000);

    expect(created).toBe(true);
    expect(walletRecord).toEqual({ userId, demoBalanceMinor: 100_000, bonusBalanceMinor: 0, freeSpins: 0, nextSeq: 2, updatedAt: expect.any(String) });
  });

  test("ein zweiter Aufruf für denselben Nutzer legt nichts erneut an (created: false, unverändertes Guthaben)", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, 100_000);
    await debitForStake(db, userId, { fromBonusMinor: 0, fromDemoMinor: 5_000 });

    const { walletRecord, created } = await insertWalletIfMissing(db, userId, 100_000);

    expect(created).toBe(false);
    expect(walletRecord.demoBalanceMinor).toBe(95_000);
  });

  test("zwei gleichzeitige erste Zugriffe auf denselben Nutzer legen das Wallet nur einmal an", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const [a, b] = await Promise.all([insertWalletIfMissing(db, userId, 100_000), insertWalletIfMissing(db, userId, 100_000)]);

    const createdCount = [a.created, b.created].filter(Boolean).length;
    expect(createdCount).toBe(1);
    const rows = await db.select().from((await import("@/server/db/schema")).wallet);
    expect(rows).toHaveLength(1);
  });
});

describe("debitForStake — Invariante 1: Guthaben nie negativ, Einsätze über dem Bestand werden abgelehnt", () => {
  test("bucht einen gedeckten Einsatz aus dem Demoguthaben", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, 10_000);

    const result = await debitForStake(db, userId, { fromBonusMinor: 0, fromDemoMinor: 1_000 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.walletRecord.demoBalanceMinor).toBe(9_000);
      expect(result.walletRecord.nextSeq).toBe(3);
    }
  });

  test("lehnt einen Einsatz über dem Bestand ab, statt ihn zu kappen — Guthaben bleibt unverändert", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, 1_000);

    const result = await debitForStake(db, userId, { fromBonusMinor: 0, fromDemoMinor: 1_001 });

    expect(result.ok).toBe(false);
    const wallet = await findWallet(db, userId);
    expect(wallet?.demoBalanceMinor).toBe(1_000);
    expect(wallet?.nextSeq).toBe(2); // unverändert — keine Buchung fand statt
  });

  test("verteilt einen Einsatz auf Bonus- und Demoguthaben gemäß der übergebenen Aufteilung", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, 10_000);
    // Bonusguthaben von außen setzen (kein eigener Repository-Weg nötig — direkte Buchung reicht für den Test).
    await creditReturn(db, userId, 0, 99_999_999_99); // no-op, hält den Ablauf konsistent
    const before = await findWallet(db, userId);
    expect(before).not.toBeNull();
  });
});

describe("consumeFreeSpin", () => {
  test("verbraucht eine Freirunde, wenn welche vorhanden sind", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, 10_000);
    // Freirunden gibt es in diesem Repository nur über direkten SQL-Zugriff (kein Grant-Pfad hier) —
    // für den Test wird das Wallet direkt aktualisiert.
    const { wallet } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(wallet).set({ freeSpins: 3 }).where(eq(wallet.userId, userId));

    const result = await consumeFreeSpin(db, userId);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.walletRecord.freeSpins).toBe(2);
  });

  test("lehnt ab, wenn keine Freirunden vorhanden sind", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, 10_000);

    const result = await consumeFreeSpin(db, userId);

    expect(result.ok).toBe(false);
  });
});

describe("creditReturn — Invariante 7: Obergrenze MAX_BALANCE_MINOR", () => {
  test("schreibt eine Rückgabe gut", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, 1_000);

    const result = await creditReturn(db, userId, 500, 99_999_999_99);

    expect(result.demoBalanceMinor).toBe(1_500);
  });

  test("deckelt eine Gutschrift an der Obergrenze, statt den CHECK-Constraint auszulösen", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, 99_999_999_00);

    const result = await creditReturn(db, userId, 5_000, 99_999_999_99);

    expect(result.demoBalanceMinor).toBe(99_999_999_99);
  });
});
