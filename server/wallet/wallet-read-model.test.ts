// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { user } from "@/server/db/auth-schema";
import { insertWalletIfMissing, debitForStake } from "@/server/repositories/wallet-repository";
import { insertLedgerEntry, sumLedgerAmountForUser } from "@/server/repositories/ledger-repository";
import { START_BALANCE_MINOR } from "@/lib/constants";
import { resolveWalletBalance } from "./wallet-read-model";

async function seedUser(db: TestDatabase, id = "u1"): Promise<string> {
  await db.insert(user).values({ id, name: "Testnutzer", email: `${id}@example.com` });
  return id;
}

describe("resolveWalletBalance — Auftrag §1", () => {
  test("Gast ohne Sitzung (userId null): Standard-Startguthaben, kein Fehler, kein Datenbankzugriff nötig", async () => {
    const db = await createTestDatabase();

    const balance = await resolveWalletBalance(db, null);

    expect(balance).toEqual({ demoBalanceMinor: START_BALANCE_MINOR, bonusBalanceMinor: 0, freeSpins: 0 });
  });

  test("angemeldeter Nutzer ohne angelegtes Wallet (noch nie gespielt): dasselbe Standard-Startguthaben, kein Fehler", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);

    const balance = await resolveWalletBalance(db, userId);

    expect(balance).toEqual({ demoBalanceMinor: START_BALANCE_MINOR, bonusBalanceMinor: 0, freeSpins: 0 });
  });

  test("Nutzer mit angelegtem Wallet: der tatsächliche, gebuchte Stand — nicht das Startguthaben", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    await insertWalletIfMissing(db, userId, START_BALANCE_MINOR);
    await debitForStake(db, userId, { fromBonusMinor: 0, fromDemoMinor: 5_000 });

    const balance = await resolveWalletBalance(db, userId);

    expect(balance.demoBalanceMinor).toBe(START_BALANCE_MINOR - 5_000);
  });

  test("Autorisierung: liest ausschließlich das Wallet der übergebenen userId", async () => {
    const db = await createTestDatabase();
    const userA = await seedUser(db, "user-a");
    const userB = await seedUser(db, "user-b");
    await insertWalletIfMissing(db, userA, 1_000);
    await insertWalletIfMissing(db, userB, 999_000);

    const balance = await resolveWalletBalance(db, userA);

    expect(balance.demoBalanceMinor).toBe(1_000);
  });

  test("Konsistenz (Auftrag §8): die Summe aller Ledger-Beträge entspricht dem gelesenen Saldo", async () => {
    const db = await createTestDatabase();
    const userId = await seedUser(db);
    const { walletRecord } = await insertWalletIfMissing(db, userId, START_BALANCE_MINOR);
    await insertLedgerEntry(db, { userId, seq: 1, type: "demo_credit", amountMinor: START_BALANCE_MINOR, balanceAfterMinor: START_BALANCE_MINOR });
    await debitForStake(db, userId, { fromBonusMinor: 0, fromDemoMinor: 1_500 });
    await insertLedgerEntry(db, {
      userId,
      seq: walletRecord.nextSeq + 1,
      type: "demo_bet",
      amountMinor: -1_500,
      balanceAfterMinor: START_BALANCE_MINOR - 1_500,
    });

    const balance = await resolveWalletBalance(db, userId);
    const ledgerSum = await sumLedgerAmountForUser(db, userId);

    expect(balance.demoBalanceMinor + balance.bonusBalanceMinor).toBe(ledgerSum);
  });
});
