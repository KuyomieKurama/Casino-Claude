import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "./constants";
import { __resetStorageForTests, clearPersisted, flushNow, isPersistent, loadPersisted, readLegacySelfExclusionFlag, writeSlice } from "./storage";

describe("Storage", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("#10 fehlender Schlüssel führt zu sauberen Defaults (status empty)", () => {
    const r = loadPersisted();
    expect(r.status).toBe("empty");
    expect(r.slices).toEqual({});
  });

  it("#10 defektes JSON wird verworfen (status corrupt), Defaults", () => {
    window.localStorage.setItem(STORAGE_KEY, "{ nicht: json");
    const r = loadPersisted();
    expect(r.status).toBe("corrupt");
    expect(r.slices).toEqual({});
  });

  it("#10 falsche Form (Array, fehlende Version) wird als corrupt behandelt", () => {
    window.localStorage.setItem(STORAGE_KEY, "[1,2,3]");
    expect(loadPersisted().status).toBe("corrupt");
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ wallet: {} }));
    expect(loadPersisted().status).toBe("corrupt");
  });

  it("unbekannte schemaVersion wird verworfen statt geraten", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99, wallet: { demoBalanceMinor: 1 } }));
    const r = loadPersisted();
    expect(r.status).toBe("unsupported-version");
    expect(r.slices).toEqual({});
  });

  it("alte Daten aus Schema-Version 1 (inkl. der inzwischen entfernten session-/admin-Scheiben) werden sauber verworfen", () => {
    // SCHEMA_VERSION wurde mit der serverseitigen Authentifizierung von 1 auf 2 angehoben
    // (lib/constants.ts) — genau weil die Scheiben "session" (Client-Sitzung, Passwort-Attrappe)
    // und "admin" (Demo-Admin-Umschalter) entfielen. Alte, noch im Browser liegende Daten mit
    // diesen Scheiben dürfen NICHT als teilweise gültig interpretiert werden.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        session: { user: { id: "u1", displayName: "Alt", email: "alt@beispiel.de" }, adminEnabled: true },
        admin: {},
        wallet: { demoBalanceMinor: 500 },
      }),
    );
    const r = loadPersisted();
    expect(r.status).toBe("unsupported-version");
    expect(r.slices).toEqual({});
  });

  it("alte Daten aus Schema-Version 2 (inkl. des inzwischen entfernten pendingRound-Felds) werden sauber verworfen", () => {
    // SCHEMA_VERSION wurde von 2 auf 3 angehoben (lib/constants.ts), als der lokale Rundenpfad
    // entfernt wurde (state/wallet-reducer.ts) — "wallet.pendingRound" gibt es im neuen Typ nicht
    // mehr. Alte Daten mit einer noch offenen Runde in diesem Feld dürfen nicht stillschweigend
    // ignoriert werden, sondern müssen denselben "unsupported-version"-Pfad durchlaufen.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        wallet: {
          wallet: { demoBalanceMinor: 500, bonusBalanceMinor: 0, freeSpins: 0 },
          transactions: [],
          nextSeq: 1,
          pendingRound: { roundId: "r1", gameId: "g1", stakeMinor: 100, returnMinor: 0, outcomeKey: "pending", seed: 1, startedAt: "2026-01-01T00:00:00.000Z" },
        },
      }),
    );
    const r = loadPersisted();
    expect(r.status).toBe("unsupported-version");
    expect(r.slices).toEqual({});
  });

  it("schreibt gedrosselt in einen Schlüssel mit schemaVersion und liest die Scheiben zurück", () => {
    vi.useFakeTimers();
    writeSlice("wallet", { demoBalanceMinor: 123 });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(300);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.wallet).toEqual({ demoBalanceMinor: 123 });
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith("velora"))).toEqual([STORAGE_KEY]);
    __resetStorageForTests();
    const r = loadPersisted();
    expect(r.status).toBe("ok");
    expect(r.slices.wallet).toEqual({ demoBalanceMinor: 123 });
  });

  it("eine frühere 'rg'-Scheibe (SCHEMA_VERSION 3, vor der serverseitigen Umstellung) wird sauber verworfen, nicht stillschweigend entsperrt", () => {
    // Eine dort möglicherweise gesetzte Selbstsperre ("selfExcluded: true") geht dadurch nicht in
    // die Datenbank über (keine Migration, siehe lib/constants.ts-Versionskommentar) — der Nutzer
    // sieht aber "unsupported-version" statt eines stillschweigend zurückgesetzten Zustands.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 3, wallet: { demoBalanceMinor: 500 }, rg: { selfExcluded: true, sessionStartedAt: "2026-01-01T00:00:00.000Z", reminderIntervalMinutes: 30 } }),
    );
    const r = loadPersisted();
    expect(r.status).toBe("unsupported-version");
    expect(r.slices).toEqual({});
  });

  it("readLegacySelfExclusionFlag erkennt eine vor der Umstellung lokal gesetzte Selbstsperre trotz veralteter schemaVersion", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 3, rg: { selfExcluded: true, sessionStartedAt: "2026-01-01T00:00:00.000Z", reminderIntervalMinutes: 30 } }),
    );
    expect(readLegacySelfExclusionFlag()).toBe(true);
  });

  it("readLegacySelfExclusionFlag liefert false ohne 'rg'-Scheibe, bei selfExcluded:false und ohne gespeicherte Daten", () => {
    expect(readLegacySelfExclusionFlag()).toBe(false); // kein Schlüssel vorhanden
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 3, wallet: { demoBalanceMinor: 500 } }));
    expect(readLegacySelfExclusionFlag()).toBe(false); // keine 'rg'-Scheibe
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 3, rg: { selfExcluded: false } }));
    expect(readLegacySelfExclusionFlag()).toBe(false); // explizit nicht gesperrt
  });

  it("readLegacySelfExclusionFlag wirft nie, auch bei defektem JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{ nicht: json");
    expect(() => readLegacySelfExclusionFlag()).not.toThrow();
    expect(readLegacySelfExclusionFlag()).toBe(false);
  });

  it("blockiertes Storage → In-Memory-Fallback, isPersistent() ist false, nichts wirft", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => loadPersisted()).not.toThrow();
    expect(isPersistent()).toBe(false);
    expect(loadPersisted().status).toBe("unavailable");
    writeSlice("wallet", { a: 1 });
    flushNow();
    expect(loadPersisted().slices.wallet).toEqual({ a: 1 });
    clearPersisted();
    expect(loadPersisted().slices).toEqual({});
  });
});
