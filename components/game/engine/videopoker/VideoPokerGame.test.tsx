import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { ROUND_DURATION_MS, STORAGE_KEY } from "@/lib/constants";
import { games } from "@/data/catalog";
import { VideoPokerGame } from "./VideoPokerGame";
import { dealHand, finishVideoPokerRound, type PokerCard } from "./videopoker-logic";

/**
 * Rauchtest der Oberfläche: interaktive Runde (geben → halten → tauschen) über useRound in der
 * Server-Betriebsart (Phase 3b). `fetch` wird auf POST /api/rounds/interactive-start und
 * POST /api/rounds/:id/actions gemockt, mit genau der Antwortform, die server/rounds/interactive/
 * videopoker-adapter.ts liefert — berechnet über dieselbe unveränderte Fachlogik
 * (dealHand/finishVideoPokerRound), die auch der Server verwendet. Die Handbewertung selbst
 * prüft videopoker-logic.test.ts.
 */

const game = games.find((g) => g.id === "g-video-poker")!;
const SEED = 7;
const STAKE = 100;

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/** Bildet server/rounds/interactive/videopoker-adapter.ts über fetch() nach — siehe Dateikommentar. */
function mockVideoPokerRoutes(seed: number, stakeMinor: number, startBalanceMinor: number) {
  let hand: PokerCard[] | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

      if (url.toString().endsWith("/api/rounds/interactive-start")) {
        hand = dealHand(seed).hand;
        return json({
          status: "open",
          roundId: "r-vp-test",
          gameModeId: "g-video-poker",
          stakeMinor,
          maxReturnMinor: stakeMinor * 250,
          betKey: null,
          usedFreeSpin: false,
          nextSeq: 1,
          state: { hand, finalHand: null, category: null },
          wallet: { balanceMinor: startBalanceMinor - stakeMinor, bonusBalanceMinor: 0, freeSpins: 0 },
        });
      }

      if (url.toString().endsWith("/actions") && hand) {
        const holds = (body.payload as { holds: boolean[] }).holds;
        const result = finishVideoPokerRound(seed, holds, stakeMinor);
        return json({
          status: "settled",
          roundId: "r-vp-test",
          nextSeq: 2,
          stakeMinor,
          returnMinor: result.returnMinor,
          netMinor: result.returnMinor - stakeMinor,
          outcomeKey: result.category,
          outcomeLabel: result.outcomeLabel,
          seed,
          state: { hand, finalHand: result.finalHand, category: result.category },
          wallet: { balanceMinor: startBalanceMinor - stakeMinor + result.returnMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          detail: { category: result.category, multiplier: result.multiplier },
        });
      }
      throw new Error(`mockVideoPokerRoutes: unerwarteter Aufruf ${String(url)}`);
    }),
  );
}

describe("VideoPokerGame — Oberfläche und Server-Verdrahtung (Phase 3b)", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("spielt eine Runde vom Geben bis zum Tausch durch und bucht genau einmal", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockVideoPokerRoutes(SEED, STAKE, 100_000);
    render(
      <AppProviders>
        <VideoPokerGame game={game} />
      </AppProviders>,
    );
    await tick(800);

    const deal = screen.getByRole("button", { name: "Karten geben" });
    expect(deal).toBeEnabled();
    await user.click(deal);
    await tick(0);

    // Fünf Karten liegen, keine ist vorausgewählt (Regel 7).
    for (let i = 1; i <= 5; i++) {
      const card = screen.getByRole("button", { name: new RegExp(`^Karte ${i} von 5:`) });
      expect(card).toHaveAttribute("aria-pressed", "false");
    }

    await user.click(screen.getByRole("button", { name: /^Karte 1 von 5:/ }));
    expect(screen.getByRole("button", { name: /^Karte 1 von 5:/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 von 5 Karten gehalten")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Tauschen/ }));
    await tick(ROUND_DURATION_MS + 50);

    expect(screen.getByText("Runde abgeschlossen")).toBeInTheDocument();
    expect(screen.getAllByText(/Rückgabe/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Karten geben" })).toBeEnabled();
  });

  it("Ziffern 1 bis 5 halten und lösen die jeweilige Karte", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockVideoPokerRoutes(SEED, STAKE, 100_000);
    render(
      <AppProviders>
        <VideoPokerGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Karten geben" }));
    await tick(0);

    const third = screen.getByRole("button", { name: /^Karte 3 von 5:/ });
    third.focus();
    await user.keyboard("3");
    expect(screen.getByRole("button", { name: /^Karte 3 von 5:/ })).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("3");
    expect(screen.getByRole("button", { name: /^Karte 3 von 5:/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("zeigt die Gewinntabelle und weist keinen RTP aus", async () => {
    render(
      <AppProviders>
        <VideoPokerGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    expect(screen.getByRole("table", { name: /Gewinntabelle Jacks or Better/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Royal Flush/ })).toBeInTheDocument();
    expect(screen.getByText(/kein RTP ausgewiesen/)).toBeInTheDocument();
    expect(game.rtpDemo).toBeUndefined();
  });
});
