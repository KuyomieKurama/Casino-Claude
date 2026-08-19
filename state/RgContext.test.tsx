import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests, writeSlice, flushNow } from "@/lib/storage";
import { STORAGE_KEY } from "@/lib/constants";
import { useRg } from "./RgContext";

/**
 * Auftrag „Server statt Client": `rg` kommt vom Server (SSR-Prop `initialRg`), Mutationen laufen
 * über gemockte `fetch()`-Aufrufe gegen `app/api/rg/**` — dasselbe Testmuster wie
 * components/game/engine/useRound.server.test.tsx.
 *
 * Der wichtigste Fall hier: eine VOR dieser Umstellung lokal gesetzte Selbstsperre
 * (state/rg-reducer.ts, entfernt) darf beim Umstieg nicht stillschweigend verschwinden — siehe
 * state/RgContext.tsx::legacyMigrationRan.
 */

function Probe() {
  const { rg, hydrated } = useRg();
  return (
    <div>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <span data-testid="excluded">{String(rg.selfExcluded)}</span>
    </div>
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("RgContext — Migration einer lokal gesetzten Selbstsperre", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ohne lokalen Sperrvermerk: kein Migrationsaufruf, rg bleibt beim Server-Anfangszustand", async () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );

    expect(screen.getByTestId("hydrated").textContent).toBe("true");
    expect(screen.getByTestId("excluded").textContent).toBe("false");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("mit einem vor der Umstellung lokal gesetzten Sperrvermerk: überträgt die Sperre einmalig auf den Server, statt sie zu verwerfen", async () => {
    // Simuliert einen früheren Besuch mit SCHEMA_VERSION 3 (vor der serverseitigen Umstellung).
    writeSlice("wallet", { wallet: { balanceMinor: 500, bonusBalanceMinor: 0, freeSpins: 0 }, transactions: [], nextSeq: 1 });
    flushNow();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 3,
        rg: { selfExcluded: true, sessionStartedAt: "2026-01-01T00:00:00.000Z", reminderIntervalMinutes: 30 },
      }),
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { rg: { sessionStartedAt: "2026-08-15T10:00:00.000Z", reminderIntervalMinutes: 30, selfExcluded: true, selfExcludedAt: "2026-08-15T10:00:00.000Z" } } }),
    );

    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );

    // Der Server-Anfangszustand kennt die Sperre noch nicht (kein initialRg-Prop hier) — erst
    // nach der Migrationsantwort zeigt die Anzeige "true".
    await waitFor(() => expect(screen.getByTestId("excluded").textContent).toBe("true"));
    expect(fetchMock).toHaveBeenCalledWith("/api/rg/self-exclusion", expect.objectContaining({ body: JSON.stringify({ action: "activate" }) }));
  });

  it("ist der Server bereits gesperrt (initialRg), unterbleibt ein zusätzlicher Migrationsaufruf", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 3, rg: { selfExcluded: true, sessionStartedAt: "2026-01-01T00:00:00.000Z", reminderIntervalMinutes: 30 } }),
    );

    render(
      <AppProviders rgSnapshot={{ sessionStartedAt: "2026-08-15T10:00:00.000Z", reminderIntervalMinutes: 30, selfExcluded: true }}>
        <Probe />
      </AppProviders>,
    );

    expect(screen.getByTestId("excluded").textContent).toBe("true");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
