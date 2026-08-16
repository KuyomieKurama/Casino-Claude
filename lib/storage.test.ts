import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "./constants";
import { __resetStorageForTests, clearPersisted, flushNow, isPersistent, loadPersisted, writeSlice } from "./storage";

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

  it("schreibt gedrosselt in einen Schlüssel mit schemaVersion und liest die Scheiben zurück", () => {
    vi.useFakeTimers();
    writeSlice("wallet", { demoBalanceMinor: 123 });
    writeSlice("rg", { selfExcluded: false });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(300);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.wallet).toEqual({ demoBalanceMinor: 123 });
    expect(Object.keys(window.localStorage).filter((k) => k.startsWith("velora"))).toEqual([STORAGE_KEY]);
    __resetStorageForTests();
    const r = loadPersisted();
    expect(r.status).toBe("ok");
    expect(r.slices.rg).toEqual({ selfExcluded: false });
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
