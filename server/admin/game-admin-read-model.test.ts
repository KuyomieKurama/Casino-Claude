// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createTestDatabase, seedMinimalCatalog } from "@/server/db/test-harness";
import { PgGameModeRepository } from "@/server/repositories/game-mode-repository";
import { resolveAdminGameOverview } from "./game-admin-read-model";

describe("resolveAdminGameOverview", () => {
  test("gruppiert Modi unter ihrem Titel", async () => {
    const db = await createTestDatabase();
    const { gameId } = await seedMinimalCatalog(db);
    await new PgGameModeRepository(db).upsert({
      id: "mode-1",
      gameId,
      key: "k",
      label: "K",
      kind: "variant",
      engineKey: "slot",
      paytableKey: null,
      minBetMinor: 10,
      maxBetMinor: 100,
      isLivePresentation: false,
      isDefault: true,
      sortOrder: 0,
      status: "active",
    });

    const overview = await resolveAdminGameOverview(db);

    expect(overview).toHaveLength(1);
    expect(overview[0]?.modes).toHaveLength(1);
    expect(overview[0]?.modes[0]?.id).toBe("mode-1");
  });

  test("ein Titel ohne Modus liefert eine leere modes-Liste, kein Fehler", async () => {
    const db = await createTestDatabase();
    await seedMinimalCatalog(db);

    const overview = await resolveAdminGameOverview(db);

    expect(overview[0]?.modes).toEqual([]);
  });
});
