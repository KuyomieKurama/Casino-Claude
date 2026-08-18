// @vitest-environment node
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Route Handler importieren `db` aus server/db/client.ts (echte PostgreSQL-Verbindung) und
// `auth` aus server/auth/index.ts (daran gebunden). Für den Test wird beides durch eine frische
// PGlite-Instanz ersetzt — dasselbe Muster wie server/db/test-harness.ts in allen anderen
// Server-Tests, nur hier über vi.mock, weil die Route diese Module nicht als Parameter annimmt.
// Die Factory läuft nur EINMAL für die ganze Datei — alle Tests teilen sich dieselbe Datenbank.
vi.mock("@/server/db/client", async () => {
  const { createTestDatabase } = await import("@/server/db/test-harness");
  const db = await createTestDatabase();
  return { db };
});
vi.mock("@/server/auth", async () => {
  const { db } = await import("@/server/db/client");
  const { createAuth } = await import("@/server/auth/create-auth");
  return { auth: createAuth(db) };
});

// getSession() liest normalerweise next/headers() — das setzt einen echten Next.js-Request-
// Kontext voraus, den es beim direkten Aufruf des Route-Handlers in Vitest nicht gibt. Gemockt
// nach demselben Muster wie app/(user)/layout.test.tsx: der Rundenstart selbst (Buchung,
// Gastkonto-Anlage, Antwortformat) wird gegen die echte Logik geprüft, nur die Sitzungsermittlung
// wird hier vorgegeben.
const getSessionMock = vi.fn();
vi.mock("@/server/auth/guards", () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));

import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { seedMinimalCatalog, type TestDatabase } from "@/server/db/test-harness";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { user } from "@/server/db/auth-schema";
import { POST } from "./route";

// `db` ist zur Laufzeit (dank vi.mock oben) eine PGlite-Instanz, statisch aber weiterhin als der
// echte NodePgDatabase-Typ aus server/db/client.ts typisiert — daher die explizite Umwandlung
// nur für seedMinimalCatalog(), das den strengeren PGlite-Testtyp verlangt.
const testDb = db as unknown as TestDatabase;

// Katalog und Spielmodus einmalig für die gesamte Datei säen (geteilte Datenbank, siehe oben).
beforeAll(async () => {
  const { gameId } = await seedMinimalCatalog(testDb);
  const modeRepo = new PgGameModeRepository(db);
  await modeRepo.upsert({
    id: "g-dice-demo",
    gameId,
    key: "standard",
    label: "Standard",
    kind: "variant",
    engineKey: "dice",
    paytableKey: null,
    minBetMinor: 10,
    maxBetMinor: 100_000,
    isLivePresentation: false,
    isDefault: true,
    sortOrder: 0,
    status: "active",
  });
});

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/rounds/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/rounds/start", () => {
  /**
   * Der eigentliche Beweis für „Spielen nur angemeldet" auf diesem Pfad: dieser Test ruft den
   * echten Route-Handler auf — genau den Pfad, den ein direkter `fetch("/api/rounds/start", …)`
   * unter Umgehung jeder Oberfläche nimmt. Kein Gastkonto wird mehr angelegt (die frühere
   * Gastspiel-Mechanik ist entfernt); ohne Sitzung wird strikt abgelehnt.
   */
  test("ohne Sitzung: wird mit 401 und dem eigenständigen Code UNAUTHENTICATED abgelehnt, es wird keine Runde gebucht", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    const response = await POST(postRequest({ gameModeId: "g-dice-demo", stakeMinor: 100, idempotencyKey: "anon-round-1", betId: "under-50" }));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "UNAUTHENTICATED" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("mit gültiger Sitzung: bucht die Runde auf das angemeldete Konto und setzt kein Cookie", async () => {
    await db.insert(user).values({ id: "member-1", name: "Mitglied", email: "member@example.com" });
    getSessionMock.mockResolvedValueOnce({ user: { id: "member-1", email: "member@example.com", name: "Mitglied", role: "user", status: "active", isGuest: false } });

    const response = await POST(postRequest({ gameModeId: "g-dice-demo", stakeMinor: 100, idempotencyKey: "member-round-1", betId: "under-50" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data?: { returnMinor: number } };
    expect(body.success).toBe(true);
    expect(response.headers.get("set-cookie")).toBeNull();
    const [row] = await db.select().from(user).where(eq(user.id, "member-1"));
    expect(row?.isGuest).toBe(false);
  });

  test("lehnt einen fehlerhaften Body mit 400 und INVALID_STAKE ab", async () => {
    const response = await POST(postRequest({ gameModeId: "g-dice-demo" }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "INVALID_STAKE" });
  });

  test("ein mitgeschicktes returnMinor im Body hat keine Wirkung auf das Ergebnis", async () => {
    await db.insert(user).values({ id: "member-tamper", name: "Mitglied", email: "member-tamper@example.com" });
    getSessionMock.mockResolvedValueOnce({ user: { id: "member-tamper", email: "member-tamper@example.com", name: "Mitglied", role: "user", status: "active", isGuest: false } });

    const response = await POST(
      postRequest({ gameModeId: "g-dice-demo", stakeMinor: 100, idempotencyKey: "tamper-round-1", betId: "under-50", returnMinor: 999_999_999 }),
    );

    const body = (await response.json()) as { success: boolean; data?: { returnMinor: number } };
    expect(body.success).toBe(true);
    expect(body.data?.returnMinor).not.toBe(999_999_999);
  });

  test("unbekannter Spielmodus wird abgelehnt", async () => {
    await db.insert(user).values({ id: "member-unknown-mode", name: "Mitglied", email: "member-unknown-mode@example.com" });
    getSessionMock.mockResolvedValueOnce({ user: { id: "member-unknown-mode", email: "member-unknown-mode@example.com", name: "Mitglied", role: "user", status: "active", isGuest: false } });

    const response = await POST(postRequest({ gameModeId: "unbekannt", stakeMinor: 100, idempotencyKey: "unknown-mode-1" }));

    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "INVALID_STAKE" });
  });

  /**
   * Der eigentliche Beweis (Auftrag „Server statt Client"): dieser Test ruft den echten
   * Route-Handler auf — genau den Pfad, den ein direkter `fetch("/api/rounds/start", …)` unter
   * Umgehung jeder Oberfläche nimmt. Selbstsperre lebt ausschließlich in der Datenbank
   * (`rg_setting`), niemals im Request — der Client könnte hier keinen anderen Wert vortäuschen,
   * selbst wenn er es versuchte.
   */
  test("Responsible-Gaming-Sperre: ein selbstgesperrter, angemeldeter Nutzer kann über einen direkten API-Aufruf keine Runde starten", async () => {
    await db.insert(user).values({ id: "member-excluded", name: "Gesperrt", email: "excluded@example.com" });
    const { activateSelfExclusion } = await import("@/server/repositories/rg-settings-repository");
    await activateSelfExclusion(testDb, "member-excluded", new Date().toISOString());
    getSessionMock.mockResolvedValueOnce({ user: { id: "member-excluded", email: "excluded@example.com", name: "Gesperrt", role: "user", status: "active", isGuest: false } });

    const response = await POST(postRequest({ gameModeId: "g-dice-demo", stakeMinor: 100, idempotencyKey: "excluded-round-1", betId: "under-50" }));

    expect(response.status).toBe(200); // Ablehnung ist ein Fachentscheid (200 + error), kein Transportfehler.
    const body = (await response.json()) as { success: boolean; error?: string };
    expect(body).toEqual({ success: false, error: "RG_BLOCKED" });
  });
});
