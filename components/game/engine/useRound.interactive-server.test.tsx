import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY } from "@/lib/constants";
import { useRound } from "./useRound";

/**
 * Server-Rundenchoreografie für INTERAKTIVE Runden (Phase 3b: Blackjack, Mines, Video Poker) —
 * `server: true, interactive: true`. Ergänzt useRound.server.test.tsx (nicht-interaktiv) um den
 * Fall, dass eine Runde nach dem Start offen bleibt und über mehrere `sendAction()`-Aufrufe zu
 * Ende geführt wird.
 */

const game: Game = {
  id: "g-mines-demo",
  slug: "mines-demo",
  name: "Testspiel",
  category: "arcade",
  providerId: "velora-studios",
  description: "Nur für den Test.",
  thumbnail: "",
  thumbnailAlt: "",
  tags: [],
  demoDifficulty: "easy",
  minDemoBetMinor: 10,
  maxDemoBetMinor: 1000,
  isNew: false,
  isPopular: false,
  isFeatured: false,
  isLiveDemo: false,
  status: "active",
  releasedAt: "2026-01-01",
  popularityScore: 1,
};

function ServerInteractiveHarness() {
  const round = useRound({ game, roundDurationMs: 50, server: true, interactive: true, defaultStakeMinor: 100 });
  return (
    <div>
      <span data-testid="status">{round.status}</span>
      <span data-testid="balance">{round.wallet.balanceMinor}</span>
      <span data-testid="net">{round.last ? round.last.netMinor : "—"}</span>
      <span data-testid="error">{round.inlineError?.code ?? ""}</span>
      <span data-testid="state">{JSON.stringify(round.interactiveState)}</span>
      <button onClick={() => void round.startInteractive()}>starten</button>
      <button onClick={() => void round.sendAction("reveal", { cell: 3 })}>aktion</button>
    </div>
  );
}

const renderRound = () =>
  render(
    <AppProviders>
      <ServerInteractiveHarness />
    </AppProviders>,
  );

async function settleTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("useRound — interaktive Server-Runden (Phase 3b)", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("startInteractive() bucht den Einsatz und zeigt den vom Server gelieferten Zustand, ohne die Runde abzuschließen", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          status: "open",
          roundId: "r1",
          gameModeId: "g-mines-demo",
          stakeMinor: 100,
          maxReturnMinor: 500_000,
          betKey: "m3",
          usedFreeSpin: false,
          nextSeq: 1,
          state: { mines: 3, status: "open", revealedCells: [], revealedCount: 0, multiplier: 0, cellsRemaining: 22 },
          wallet: { balanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
        },
      }),
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound();
    await settleTimers(800);
    expect(screen.getByTestId("status").textContent).toBe("ready");

    await user.click(screen.getByText("starten"));
    expect(screen.getByTestId("status").textContent).toBe("playing");
    // Ein zusätzlicher Tick lässt die Promise-Kette aus fetch() + response.json() vollständig
    // durchlaufen (setStatus("playing") passiert bereits synchron VOR dem await, syncServerWallet
    // erst danach) — derselbe Grund, aus dem useRound.server.test.tsx den Saldo erst nach einem
    // Timer-Tick prüft.
    await settleTimers(0);
    expect(screen.getByTestId("balance").textContent).toBe("99900");
    expect(screen.getByTestId("state").textContent).toContain('"revealedCells":[]');
    expect(screen.getByTestId("net").textContent).toBe("—"); // noch kein Ergebnis — die Runde läuft

    // Der Client sendet niemals ein Ergebnis, einen Seed oder Minenpositionen.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ gameModeId: "g-mines-demo", stakeMinor: 100, idempotencyKey: expect.any(String), useFreeSpin: false });
    expect(sentBody.seed).toBeUndefined();
    expect(sentBody.returnMinor).toBeUndefined();
  });

  it("sendAction() aktualisiert den Zustand bei einer offenen Antwort, ohne die Runde abzuschließen", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            status: "open",
            roundId: "r1",
            gameModeId: "g-mines-demo",
            stakeMinor: 100,
            maxReturnMinor: 500_000,
            betKey: "m3",
            usedFreeSpin: false,
            nextSeq: 1,
            state: { mines: 3, status: "open", revealedCells: [], revealedCount: 0, multiplier: 0, cellsRemaining: 22 },
            wallet: { balanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            status: "open",
            roundId: "r1",
            nextSeq: 2,
            stakeMinor: 100,
            state: { mines: 3, status: "open", revealedCells: [3], revealedCount: 1, multiplier: 1.1, cellsRemaining: 21 },
            wallet: { balanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
      );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound();
    await settleTimers(800);
    await user.click(screen.getByText("starten"));

    await user.click(screen.getByText("aktion"));
    expect(screen.getByTestId("status").textContent).toBe("playing");
    expect(screen.getByTestId("state").textContent).toContain('"revealedCells":[3]');

    // Zweiter fetch-Aufruf trägt seq: 2 — die vom ersten Aufruf zurückgemeldete nextSeq.
    const [, initSecond] = fetchMock.mock.calls[1] as [string, RequestInit];
    const sentBody = JSON.parse(initSecond.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ seq: 1, action: "reveal", payload: { cell: 3 } });
  });

  it("sendAction() mit settled-Antwort schließt die Runde ab und zeigt netto", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            status: "open",
            roundId: "r1",
            gameModeId: "g-mines-demo",
            stakeMinor: 100,
            maxReturnMinor: 500_000,
            betKey: "m3",
            usedFreeSpin: false,
            nextSeq: 1,
            state: { mines: 3, status: "open", revealedCells: [], revealedCount: 0, multiplier: 0, cellsRemaining: 22 },
            wallet: { balanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            status: "settled",
            roundId: "r1",
            nextSeq: 2,
            stakeMinor: 100,
            returnMinor: 0,
            netMinor: -100,
            outcomeKey: "mine",
            outcomeLabel: "Mine getroffen nach 0 Feldern",
            seed: 42,
            state: { mines: 3, status: "hit", revealedCells: [], revealedCount: 0, multiplier: 0, cellsRemaining: 22, positions: [1, 2, 3], hitCell: 3 },
            wallet: { balanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
      );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound();
    await settleTimers(800);
    await user.click(screen.getByText("starten"));

    await user.click(screen.getByText("aktion"));
    await settleTimers(50);
    expect(screen.getByTestId("status").textContent).toBe("finished");
    expect(screen.getByTestId("net").textContent).toBe("-100");
    expect(screen.getByTestId("state").textContent).toContain('"positions":[1,2,3]');
  });

  it("eine Ablehnung während einer Aktion (z. B. INVALID_STAKE) zeigt die Meldung, die Runde bleibt offen", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            status: "open",
            roundId: "r1",
            gameModeId: "g-mines-demo",
            stakeMinor: 100,
            maxReturnMinor: 500_000,
            betKey: "m3",
            usedFreeSpin: false,
            nextSeq: 1,
            state: { mines: 3, status: "open", revealedCells: [], revealedCount: 0, multiplier: 0, cellsRemaining: 22 },
            wallet: { balanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: false, error: "INVALID_STAKE" }));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound();
    await settleTimers(800);
    await user.click(screen.getByText("starten"));

    await user.click(screen.getByText("aktion"));
    expect(screen.getByTestId("error").textContent).toBe("INVALID_STAKE");
    expect(screen.getByTestId("status").textContent).toBe("playing"); // Runde bleibt offen, kein Absturz
  });

  it("Doppelklick-Schutz: zwei sendAction()-Aufrufe im selben Task lösen nur einen fetch-Aufruf für die Aktion aus", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          status: "open",
          roundId: "r1",
          gameModeId: "g-mines-demo",
          stakeMinor: 100,
          maxReturnMinor: 500_000,
          betKey: "m3",
          usedFreeSpin: false,
          nextSeq: 1,
          state: { mines: 3, status: "open", revealedCells: [], revealedCount: 0, multiplier: 0, cellsRemaining: 22 },
          wallet: { balanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
        },
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound();
    await settleTimers(800);
    await user.click(screen.getByText("starten"));
    fetchMock.mockClear();

    await act(async () => {
      const btn = screen.getByText("aktion");
      btn.click();
      btn.click();
      btn.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
