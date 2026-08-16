"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isPersistent, loadPersisted, type PersistedSlices, type StorageStatus } from "@/lib/storage";

type PersistenceValue = {
  /** true, sobald LocalStorage einmal gelesen wurde (nur auf dem Client). */
  hydrated: boolean;
  status: StorageStatus;
  slices: PersistedSlices;
  /** false im In-Memory-Fallback — dann bleibt nach dem Reload nichts erhalten. */
  persistent: boolean;
};

const PersistenceContext = createContext<PersistenceValue>({ hydrated: false, status: "empty", slices: {}, persistent: true });

/**
 * Liest den Storage genau einmal nach dem Mount. Bis dahin ist `hydrated` false und alle
 * zustandsabhängigen Stellen zeigen Skeletons (Konzept C7).
 */
export function PersistenceProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<PersistenceValue>({ hydrated: false, status: "empty", slices: {}, persistent: true });

  useEffect(() => {
    const result = loadPersisted();
    setValue({ hydrated: true, status: result.status, slices: result.slices, persistent: isPersistent() });
  }, []);

  const memo = useMemo(() => value, [value]);
  return <PersistenceContext.Provider value={memo}>{children}</PersistenceContext.Provider>;
}

export function usePersistence(): PersistenceValue {
  return useContext(PersistenceContext);
}
