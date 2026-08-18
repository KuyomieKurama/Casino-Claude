/**
 * Zeitraum-Filter der Spielhistorie (app/(user)/history). Eigener Typ in types/**, damit sowohl
 * server/wallet/ledger-history.ts (Serverabfrage) als auch components/wallet/HistoryFilters.tsx
 * (Client-Steuerung) dieselbe Werteliste verwenden, ohne dass components/** aus @/server/*
 * importieren müsste (Schichtregel, eslint.config.mjs) und ohne eine zweite, driftende Kopie.
 */
export const HISTORY_RANGE_VALUES = ["all", "today", "7d", "30d"] as const;
export type HistoryRange = (typeof HISTORY_RANGE_VALUES)[number];
