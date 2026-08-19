import type { WalletRejectionCode } from "@/lib/wallet-policy";

/**
 * Fetch-Client für POST /api/rounds/start (Phase 3a). Liegt bewusst NICHT unter `@/server/*`
 * (components/** darf laut Schichtregel nichts von dort importieren) — nur `fetch` und ein
 * eigener, kleiner Antworttyp. Die Antwort ist externe, nicht vertrauenswürdige Eingabe (auch
 * wenn sie von der eigenen API kommt, siehe coding-style.md „Never trust external data") und wird
 * deshalb mit einfachen Typprüfungen genarnt, nicht ungeprüft durchgereicht.
 */

export type RoundApiWalletSnapshot = {
  balanceMinor: number;
  bonusBalanceMinor: number;
  freeSpins: number;
};

export type RoundApiData = {
  roundId: string;
  gameModeId: string;
  stakeMinor: number;
  returnMinor: number;
  netMinor: number;
  outcomeKey: string;
  outcomeLabel: string;
  seed: number;
  usedFreeSpin: boolean;
  betKey: string | null;
  detail?: Record<string, unknown>;
  wallet: RoundApiWalletSnapshot;
};

export type RoundApiResult = { ok: true; data: RoundApiData } | { ok: false; code: WalletRejectionCode };

export type StartRoundApiInput = {
  gameModeId: string;
  stakeMinor: number;
  idempotencyKey: string;
  useFreeSpin?: boolean;
  betId?: string;
  bet?: unknown;
};

function isWalletSnapshot(value: unknown): value is RoundApiWalletSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.balanceMinor === "number" && typeof v.bonusBalanceMinor === "number" && typeof v.freeSpins === "number";
}

function isRoundApiData(value: unknown): value is RoundApiData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.roundId === "string" &&
    typeof v.returnMinor === "number" &&
    typeof v.netMinor === "number" &&
    typeof v.outcomeKey === "string" &&
    typeof v.outcomeLabel === "string" &&
    typeof v.seed === "number" &&
    typeof v.usedFreeSpin === "boolean" &&
    isWalletSnapshot(v.wallet)
  );
}

/**
 * Startet eine nicht-interaktive Runde serverseitig. Wirft nie — Netzwerk- und Parsingfehler
 * werden als `{ ok: false, code: "SERVER_ERROR" }` gemeldet, damit `useRound.ts` sie wie jede
 * andere Ablehnung über dieselbe deutsche Meldung (state/wallet-reducer.ts::rejectionMessage)
 * anzeigen kann.
 */
export async function postRoundStart(input: StartRoundApiInput): Promise<RoundApiResult> {
  try {
    const response = await fetch("/api/rounds/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return { ok: false, code: "SERVER_ERROR" };
    const v = body as Record<string, unknown>;
    if (v.success === true && isRoundApiData(v.data)) return { ok: true, data: v.data };
    if (v.success === false && typeof v.error === "string") return { ok: false, code: v.error as WalletRejectionCode };
    return { ok: false, code: "SERVER_ERROR" };
  } catch {
    return { ok: false, code: "SERVER_ERROR" };
  }
}
