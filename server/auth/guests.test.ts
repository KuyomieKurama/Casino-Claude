// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { account, user } from "@/server/db/auth-schema";
import { createGuestAccount, GuestUpgradeError, upgradeGuestToEmailAccount, upgradeGuestToOAuthAccount } from "./guests";

vi.mock("server-only", () => ({}));

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("createGuestAccount", () => {
  test("legt ein Gastkonto ohne Passwort an und bindet es an eine Sitzung", async () => {
    const guest = await createGuestAccount(db);

    const [row] = await db.select().from(user).where(eq(user.id, guest.userId)).limit(1);
    expect(row?.isGuest).toBe(true);
    expect(row?.role).toBe("user");
    expect(row?.status).toBe("active");

    const [credentialAccount] = await db.select().from(account).where(eq(account.userId, guest.userId)).limit(1);
    expect(credentialAccount).toBeUndefined();
  });

  test("jedes Gastkonto bekommt eine eigene, eindeutige ID", async () => {
    const first = await createGuestAccount(db);
    const second = await createGuestAccount(db);

    expect(first.userId).not.toBe(second.userId);
    expect(first.sessionToken).not.toBe(second.sessionToken);
  });
});

describe("upgradeGuestToEmailAccount", () => {
  test("behält die Konto-ID und legt kein zweites Konto an", async () => {
    const guest = await createGuestAccount(db);

    const result = await upgradeGuestToEmailAccount(db, {
      guestUserId: guest.userId,
      email: "player@example.com",
      password: "ein-sicheres-passwort",
      name: "Spielername",
    });

    expect(result.userId).toBe(guest.userId);

    const allUsers = await db.select().from(user);
    expect(allUsers).toHaveLength(1);

    const [row] = await db.select().from(user).where(eq(user.id, guest.userId)).limit(1);
    expect(row?.isGuest).toBe(false);
    expect(row?.email).toBe("player@example.com");

    const [credentialAccount] = await db.select().from(account).where(eq(account.userId, guest.userId)).limit(1);
    expect(credentialAccount?.providerId).toBe("credential");
    // Passwort-Hash darf nie im Klartext stehen (auch nicht in Tests) und muss vom Rohwert abweichen.
    expect(credentialAccount?.password).toBeDefined();
    expect(credentialAccount?.password).not.toBe("ein-sicheres-passwort");
  });

  test("ist idempotent: zweiter Aufruf mit derselben E-Mail auf ein bereits aufgewertetes Konto legt nichts doppelt an", async () => {
    const guest = await createGuestAccount(db);
    await upgradeGuestToEmailAccount(db, { guestUserId: guest.userId, email: "player@example.com", password: "pw-eins-2345", name: "Name" });

    await expect(
      upgradeGuestToEmailAccount(db, { guestUserId: guest.userId, email: "player@example.com", password: "pw-zwei-6789", name: "Name" }),
    ).resolves.toEqual({ userId: guest.userId });

    const accounts = await db.select().from(account).where(eq(account.userId, guest.userId));
    expect(accounts).toHaveLength(1);
  });

  test("lehnt eine zweite Aufwertung auf eine andere E-Mail ab", async () => {
    const guest = await createGuestAccount(db);
    await upgradeGuestToEmailAccount(db, { guestUserId: guest.userId, email: "erste@example.com", password: "pw-eins-2345", name: "Name" });

    await expect(
      upgradeGuestToEmailAccount(db, { guestUserId: guest.userId, email: "zweite@example.com", password: "pw-zwei-6789", name: "Name" }),
    ).rejects.toThrow(GuestUpgradeError);
  });

  test("wirft bei unbekannter Gastkonto-ID", async () => {
    await expect(
      upgradeGuestToEmailAccount(db, { guestUserId: "unbekannt", email: "x@example.com", password: "pw-123456789", name: "Name" }),
    ).rejects.toThrow(GuestUpgradeError);
  });

  test("Befund 3: zwei GLEICHZEITIGE Aufwertungen derselben Gastsitzung führen zu genau einer erfolgreichen Aufwertung", async () => {
    const guest = await createGuestAccount(db);

    // Ohne Zeilensperre (SELECT ... FOR UPDATE) läsen beide Transaktionen isGuest === true,
    // BEVOR eine von beiden ihr UPDATE committet — Ergebnis wäre ein inkonsistenter Zustand aus
    // zwei Provider-Verknüpfungen (zwei `account`-Zeilen) auf nur einem Nutzer.
    const results = await Promise.allSettled([
      upgradeGuestToEmailAccount(db, { guestUserId: guest.userId, email: "a@example.com", password: "pw-eins-2345", name: "A" }),
      upgradeGuestToEmailAccount(db, { guestUserId: guest.userId, email: "b@example.com", password: "pw-zwei-6789", name: "B" }),
    ]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<{ userId: string }> => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    // Genau EIN Erfolg, genau EIN kontrollierter fachlicher Fehler (kein roher DB-Fehler wie
    // z. B. eine Unique-Constraint-Verletzung).
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(GuestUpgradeError);

    // Konsistenter Endzustand: genau ein Nutzer, genau eine Provider-Verknüpfung.
    const allUsers = await db.select().from(user);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0]?.isGuest).toBe(false);

    const accounts = await db.select().from(account).where(eq(account.userId, guest.userId));
    expect(accounts).toHaveLength(1);
  });
});

describe("upgradeGuestToOAuthAccount", () => {
  test("behält die Konto-ID, übernimmt die verifizierte E-Mail und legt kein zweites Konto an", async () => {
    const guest = await createGuestAccount(db);

    const result = await upgradeGuestToOAuthAccount(db, {
      guestUserId: guest.userId,
      provider: "google",
      accountId: "google-sub-123",
      email: "player@gmail.com",
      emailVerified: true,
      name: "Spielername",
    });

    expect(result.userId).toBe(guest.userId);

    const allUsers = await db.select().from(user);
    expect(allUsers).toHaveLength(1);

    const [row] = await db.select().from(user).where(eq(user.id, guest.userId)).limit(1);
    expect(row?.isGuest).toBe(false);
    expect(row?.emailVerified).toBe(true);

    const [providerAccount] = await db.select().from(account).where(eq(account.userId, guest.userId)).limit(1);
    expect(providerAccount?.providerId).toBe("google");
    expect(providerAccount?.accountId).toBe("google-sub-123");
  });

  test("ist idempotent: derselbe Provider-Account wird nicht doppelt verknüpft", async () => {
    const guest = await createGuestAccount(db);
    const input = { guestUserId: guest.userId, provider: "google", accountId: "google-sub-123", email: "player@gmail.com", emailVerified: true, name: "Name" };
    await upgradeGuestToOAuthAccount(db, input);

    await expect(upgradeGuestToOAuthAccount(db, input)).resolves.toEqual({ userId: guest.userId });

    const accounts = await db.select().from(account).where(eq(account.userId, guest.userId));
    expect(accounts).toHaveLength(1);
  });
});
