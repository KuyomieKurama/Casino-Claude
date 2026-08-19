import type { WalletRejectionCode } from "@/lib/wallet-policy";

/**
 * Fetch-Client für die interaktiven Rundenendpunkte (Phase 3b): `POST /api/rounds/interactive-
 * start` und `POST /api/rounds/:id/actions`. Liegt bewusst NICHT unter `@/server/*`
 * (components/** darf laut Schichtregel nichts von dort importieren) — nur `fetch` und eigene,
 * kleine Antworttypen. Die Antwort ist externe, nicht vertrauenswürdige Eingabe (siehe
 * round-api-client.ts, „Never trust external data") und wird deshalb mit Typprüfungen genarnt,
 * nicht ungeprüft durchgereicht — insbesondere `state` bleibt bewusst `unknown`: NUR die jeweilige
 * Spieloberfläche (MinesGame.tsx, BlackjackGame.tsx, VideoPokerGame.tsx) kennt dessen Form.
 */

export type RoundApiWalletSnapshot = {
  balanceMinor: number;
  bonusBalanceMinor: number;
  freeSpins: number;
};

export type InteractiveOpenData = {
  status: "open";
  roundId: string;
  gameModeId: string;
  stakeMinor: number;
  maxReturnMinor: number;
  betKey: string | null;
  usedFreeSpin: boolean;
  nextSeq: number;
  state: unknown;
  wallet: RoundApiWalletSnapshot;
};

export type InteractiveSettledData = {
  status: "settled";
  roundId: string;
  gameModeId: string;
  stakeMinor: number;
  returnMinor: number;
  netMinor: number;
  outcomeKey: string;
  outcomeLabel: string;
  seed: number;
  betKey: string | null;
  usedFreeSpin: boolean;
  state: unknown;
  wallet: RoundApiWalletSnapshot;
  /** Engine-spezifische Zusatzdaten für die Anzeige (z. B. Blackjack: Ergebnis je Hand). */
  detail?: Record<string, unknown>;
};

export type InteractiveStartData = InteractiveOpenData | InteractiveSettledData;
export type InteractiveStartResult = { ok: true; data: InteractiveStartData } | { ok: false; code: WalletRejectionCode };

export type ActionOpenData = { status: "open"; roundId: string; nextSeq: number; stakeMinor: number; state: unknown; wallet: RoundApiWalletSnapshot };
export type ActionSettledData = {
  status: "settled";
  roundId: string;
  nextSeq: number;
  stakeMinor: number;
  returnMinor: number;
  netMinor: number;
  outcomeKey: string;
  outcomeLabel: string;
  seed: number;
  state: unknown;
  wallet: RoundApiWalletSnapshot;
  /** Engine-spezifische Zusatzdaten für die Anzeige (z. B. Blackjack: Ergebnis je Hand). */
  detail?: Record<string, unknown>;
};
export type ActionData = ActionOpenData | ActionSettledData;
export type ActionResult = { ok: true; data: ActionData } | { ok: false; code: WalletRejectionCode };

export type StartInteractiveRoundApiInput = {
  gameModeId: string;
  stakeMinor: number;
  idempotencyKey: string;
  useFreeSpin?: boolean;
  betId?: string;
};

export type RoundActionApiInput = {
  seq: number;
  action: string;
  payload?: unknown;
};

function isWalletSnapshot(value: unknown): value is RoundApiWalletSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.balanceMinor === "number" && typeof v.bonusBalanceMinor === "number" && typeof v.freeSpins === "number";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isInteractiveStartData(value: unknown): value is InteractiveStartData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.roundId) || !isWalletSnapshot(v.wallet)) return false;
  if (v.status === "open") return typeof v.nextSeq === "number" && typeof v.maxReturnMinor === "number";
  if (v.status === "settled") return typeof v.returnMinor === "number" && typeof v.netMinor === "number" && isNonEmptyString(v.outcomeKey);
  return false;
}

function isActionData(value: unknown): value is ActionData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isNonEmptyString(v.roundId) || !isWalletSnapshot(v.wallet) || typeof v.nextSeq !== "number") return false;
  if (v.status === "open") return true;
  if (v.status === "settled") return typeof v.returnMinor === "number" && typeof v.netMinor === "number" && isNonEmptyString(v.outcomeKey);
  return false;
}

/** Startet eine interaktive Runde (Blackjack, Mines, Video Poker) serverseitig. Wirft nie. */
export async function postInteractiveRoundStart(input: StartInteractiveRoundApiInput): Promise<InteractiveStartResult> {
  try {
    const response = await fetch("/api/rounds/interactive-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return { ok: false, code: "SERVER_ERROR" };
    const v = body as Record<string, unknown>;
    if (v.success === true && isInteractiveStartData(v.data)) return { ok: true, data: v.data };
    if (v.success === false && typeof v.error === "string") return { ok: false, code: v.error as WalletRejectionCode };
    return { ok: false, code: "SERVER_ERROR" };
  } catch {
    return { ok: false, code: "SERVER_ERROR" };
  }
}

/** Sendet eine Spieleraktion (hit, stand, double, split, reveal, cashOut, draw). Wirft nie. */
export async function postRoundAction(roundId: string, input: RoundActionApiInput): Promise<ActionResult> {
  try {
    const response = await fetch(`/api/rounds/${encodeURIComponent(roundId)}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return { ok: false, code: "SERVER_ERROR" };
    const v = body as Record<string, unknown>;
    if (v.success === true && isActionData(v.data)) return { ok: true, data: v.data };
    if (v.success === false && typeof v.error === "string") return { ok: false, code: v.error as WalletRejectionCode };
    return { ok: false, code: "SERVER_ERROR" };
  } catch {
    return { ok: false, code: "SERVER_ERROR" };
  }
}
