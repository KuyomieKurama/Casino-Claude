// @vitest-environment node
// Gleicher Grund wie server/db/migration.test.ts: PGlite braucht die echte Node-Fetch-Implementierung.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-harness";
import { checkLoginRateLimit, hashSubject, MAX_ATTEMPTS_PER_EMAIL, MAX_ATTEMPTS_PER_IP, normalizeEmailSubject, recordLoginAttempt } from "./rate-limit";

vi.mock("server-only", () => ({}));

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("normalizeEmailSubject/hashSubject", () => {
  test("normalisiert Groß-/Kleinschreibung und Leerraum vor dem Hashen", () => {
    expect(normalizeEmailSubject("  A@Example.com  ")).toBe("a@example.com");
  });

  test("liefert für dieselbe normalisierte E-Mail immer denselben Hash", () => {
    expect(hashSubject(normalizeEmailSubject("A@x.de"))).toBe(hashSubject(normalizeEmailSubject("a@x.de")));
  });

  test("liefert nie den Rohwert zurück (Hash sieht nicht wie eine E-Mail/IP aus)", () => {
    expect(hashSubject("test@example.com")).not.toContain("@");
    expect(hashSubject("127.0.0.1")).not.toContain(".");
  });

  test("ist kein rohes, ungesalzenes SHA-256 mehr (Preimage-Härtung über HMAC mit BETTER_AUTH_SECRET)", () => {
    // Der IPv4-Adressraum (2^32) ist klein genug, um ein ungesalzenes SHA-256 in Sekunden
    // vollständig rückzurechnen (Rainbow-Table) — ein mit BETTER_AUTH_SECRET verkeyter HMAC
    // macht das ohne Kenntnis des Secrets praktisch unmöglich. Dieser Test belegt genau die
    // Umstellung: das Ergebnis darf NICHT mehr mit dem einfachen SHA-256 des Rohwerts
    // übereinstimmen.
    const plainSha256 = createHash("sha256").update("127.0.0.1").digest("hex");
    expect(hashSubject("127.0.0.1")).not.toBe(plainSha256);
  });
});

describe("checkLoginRateLimit", () => {
  test("erlaubt Versuche unterhalb des E-Mail-Limits", async () => {
    for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL - 1; i++) {
      await recordLoginAttempt(db, { email: "user@example.com", ip: "10.0.0.1", succeeded: false });
    }
    const result = await checkLoginRateLimit(db, { email: "user@example.com", ip: "10.0.0.1" });
    expect(result.blocked).toBe(false);
  });

  test("blockiert nach Erreichen des E-Mail-Limits (5 Versuche/15 Minuten)", async () => {
    for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL; i++) {
      await recordLoginAttempt(db, { email: "user@example.com", ip: `10.0.0.${i}`, succeeded: false });
    }
    const result = await checkLoginRateLimit(db, { email: "user@example.com", ip: "10.0.0.99" });
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("blockiert nach Erreichen des IP-Limits, auch bei unterschiedlichen E-Mails (20 Versuche/15 Minuten)", async () => {
    for (let i = 0; i < MAX_ATTEMPTS_PER_IP; i++) {
      await recordLoginAttempt(db, { email: `user-${i}@example.com`, ip: "10.0.0.1", succeeded: false });
    }
    const result = await checkLoginRateLimit(db, { email: "another-user@example.com", ip: "10.0.0.1" });
    expect(result.blocked).toBe(true);
  });

  test("lässt nach Ablauf des Zeitfensters wieder Versuche zu", async () => {
    vi.useFakeTimers();
    try {
      const start = new Date("2026-01-01T00:00:00.000Z");
      vi.setSystemTime(start);
      for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL; i++) {
        await recordLoginAttempt(db, { email: "user@example.com", ip: "10.0.0.1", succeeded: false });
      }
      const blocked = await checkLoginRateLimit(db, { email: "user@example.com", ip: "10.0.0.1" });
      expect(blocked.blocked).toBe(true);

      // 16 Minuten später liegt der älteste Versuch außerhalb des 15-Minuten-Fensters.
      vi.setSystemTime(new Date(start.getTime() + 16 * 60_000));
      const allowedAgain = await checkLoginRateLimit(db, { email: "user@example.com", ip: "10.0.0.1" });
      expect(allowedAgain.blocked).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("eine unbekannte IP (null) überspringt nur die IP-Prüfung, nicht die E-Mail-Prüfung", async () => {
    for (let i = 0; i < MAX_ATTEMPTS_PER_EMAIL; i++) {
      await recordLoginAttempt(db, { email: "user@example.com", ip: null, succeeded: false });
    }
    const result = await checkLoginRateLimit(db, { email: "user@example.com", ip: null });
    expect(result.blocked).toBe(true);
  });
});
