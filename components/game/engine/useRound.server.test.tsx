import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY } from "@/lib/constants";
import { useRound } from "./useRound";

/**
 * Server-Rundenchoreografie (Phase 3a): dieselbe Choreografie wie useRound.test.tsx, aber für
 * `server: true` — hier gibt es kein lokales `resolve()` mehr, das Ergebnis kommt aus einem
 * gemockten `fetch("/api/rounds/start")`.
 */

const game: Game = {
  id: "g-dice-demo",
  slug: "dice-demo",
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

function ServerHarness() {
  const round = useRound({ game, roundDurationMs: 50, server: true, defaultStakeMinor: 100 });
  return (
    <div>
      <span data-testid="status">{round.status}</span>
      <span data-testid="balance">{round.wallet.balanceMinor}</span>
      <span data-testid="net">{round.last ? round.last.netMinor : "—"}</span>
      <span data-testid="error">{round.inlineError?.code ?? ""}</span>
      <span data-testid="canstart">{String(round.canStart)}</span>
      <button onClick={() => round.play()}>spielen</button>
    </div>
  );
}

const renderRound = () =>
  render(
    <AppProviders>
      <ServerHarness />
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

describe("useRound — serverseitige, nicht-interaktive Runden (Phase 3a)", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bucht eine erfolgreiche Runde über den Server und zeigt netto an — ohne lokale resolve()", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          roundId: "r1",
          gameModeId: "g-dice-demo",
          stakeMinor: 100,
          returnMinor: 300,
          netMinor: 200,
          outcomeKey: "win",
          outcomeLabel: "Treffer",
          seed: 42,
          usedFreeSpin: false,
          betKey: "under-50",
          wallet: { balanceMinor: 99_800, bonusBalanceMinor: 0, freeSpins: 0 },
        },
      }),
    );

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound();
    await settleTimers(800);
    expect(screen.getByTestId("status").textContent).toBe("ready");

    await user.click(screen.getByText("spielen"));
    expect(screen.getByTestId("status").textContent).toBe("playing");
    await settleTimers(50);
    expect(screen.getByTestId("status").textContent).toBe("finished");
    expect(screen.getByTestId("net").textContent).toBe("200");
    // Serverstand ist die Wahrheit — die Anzeige übernimmt genau den zurückgemeldeten Saldo.
    expect(screen.getByTestId("balance").textContent).toBe("99800");

    // Der Client sendet niemals ein Ergebnis oder einen Seed — nur Modus, Einsatz, Wette.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody).toEqual({ gameModeId: "g-dice-demo", stakeMinor: 100, idempotencyKey: expect.any(String), useFreeSpin: false });
    expect(sentBody.returnMinor).toBeUndefined();
    expect(sentBody.seed).toBeUndefined();
    expect(sentBody.outcomeKey).toBeUndefined();
  });

  it("eine Ablehnung des Servers (z. B. INSUFFICIENT_FUNDS) zeigt die vorhandene deutsche Meldung und kehrt zu ready zurück", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error: "INSUFFICIENT_FUNDS" }));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound();
    await settleTimers(800);

    await user.click(screen.getByText("spielen"));
    await settleTimers(10);
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("error").textContent).toBe("INSUFFICIENT_FUNDS");
  });

  it("ein Netzwerkfehler wird als SERVER_ERROR angezeigt, nicht stillschweigend verschluckt", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound();
    await settleTimers(800);

    await user.click(screen.getByText("spielen"));
    await settleTimers(10);
    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("error").textContent).toBe("SERVER_ERROR");
  });

  it("simulierter Ladefehler führt in den Fehlerzustand, Wiederholung lädt erneut", async () => {
    // Prüft load()/simulateLoadError — Choreografie, die unabhängig vom Rundenpfad gilt (früher
    // in useRound.test.tsx neben dem inzwischen entfernten lokalen resolve()-Pfad mitgetestet).
    function ErrorHarness() {
      const round = useRound({ game, roundDurationMs: 10, server: true, simulateLoadError: true });
      return (
        <div>
          <span data-testid="load-status">{round.status}</span>
          <button onClick={round.load}>erneut</button>
        </div>
      );
    }
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AppProviders>
        <ErrorHarness />
      </AppProviders>,
    );
    await settleTimers(800);
    expect(screen.getByTestId("load-status").textContent).toBe("error");
    await user.click(screen.getByText("erneut"));
    await settleTimers(800);
    expect(screen.getByTestId("load-status").textContent).toBe("ready");
  });

  it("Doppelklick-Schutz: zwei Klicks im selben Task lösen nur einen fetch-Aufruf aus", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          roundId: "r1",
          gameModeId: "g-dice-demo",
          stakeMinor: 100,
          returnMinor: 0,
          netMinor: -100,
          outcomeKey: "none",
          outcomeLabel: "Kein Treffer",
          seed: 1,
          usedFreeSpin: false,
          betKey: "under-50",
          wallet: { balanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
        },
      }),
    );

    renderRound();
    await settleTimers(800);

    await act(async () => {
      const btn = screen.getByText("spielen");
      btn.click();
      btn.click();
      btn.click();
    });
    await settleTimers(50);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
