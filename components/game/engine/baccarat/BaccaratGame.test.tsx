import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY } from "@/lib/constants";
import { games } from "@/data/catalog";
import { BaccaratGame } from "./BaccaratGame";

/**
 * Rauchtest der Oberfläche: Wettauswahl, eine vollständige Runde über useRound, Ziehregeln,
 * Ergebnisverlauf und der statische Live-Bereich. Die Fachregeln prüft baccarat-logic.test.ts.
 */

const game = games.find((g) => g.id === "g-baccarat")!;
const live = games.find((g) => g.id === "g-live-baccarat-demo")!;

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/** Baccarat löst seine Runde seit Phase 3a serverseitig auf (siehe useRound `server: true`). */
function mockBaccaratRoundResponse() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            roundId: "r-test",
            gameModeId: "g-baccarat",
            stakeMinor: 100,
            returnMinor: 195,
            netMinor: 95,
            outcomeKey: "win",
            outcomeLabel: "Bankseite vorn 4:6",
            seed: 1,
            usedFreeSpin: false,
            betKey: "banker",
            detail: {
              bet: "banker",
              playerCards: [
                { rank: 2, suit: 0 },
                { rank: 2, suit: 1 },
              ],
              bankerCards: [
                { rank: 3, suit: 0 },
                { rank: 3, suit: 1 },
              ],
              playerTotal: 4,
              bankerTotal: 6,
              result: "banker",
              natural: false,
            },
            wallet: { balanceMinor: 100_095, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
}

describe("BaccaratGame — Oberfläche und Wallet-Verdrahtung", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("startet keine Runde ohne gewählte Wette und spielt danach eine Runde durch", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockBaccaratRoundResponse();
    render(
      <AppProviders>
        <BaccaratGame game={game} />
      </AppProviders>,
    );
    await tick(800);

    const start = screen.getByRole("button", { name: /Coup geben/ });
    expect(start).toBeDisabled();
    expect(screen.getByText("Ohne gewählte Wette startet keine Runde.")).toBeInTheDocument();

    // Keine Wette ist vorausgewählt (Regel 7).
    for (const name of ["Spieler", "Bank", "Unentschieden"]) {
      expect(screen.getByRole("radio", { name: new RegExp(name) })).toHaveAttribute("aria-checked", "false");
    }

    await user.click(screen.getByRole("radio", { name: /Bank/ }));
    expect(screen.getByRole("radio", { name: /Bank/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Coup geben/ })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Coup geben/ }));
    await tick(1600);

    expect(screen.getAllByText(/Rückgabe/).length).toBeGreaterThan(0);
    // Der Verlauf protokolliert die Runde und benennt die Unabhängigkeit der Runden.
    expect(screen.getByText(/Jede Runde ist unabhängig/)).toBeInTheDocument();
    expect(screen.queryByText("Noch keine Runde gespielt.")).not.toBeInTheDocument();
  });

  it("blendet die vollständigen Ziehregeln ein", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AppProviders>
        <BaccaratGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Ziehregeln einblenden/ }));
    expect(screen.getByRole("table", { name: /Ziehtabelle der Bank/ })).toBeInTheDocument();
    expect(screen.getByText("0, 1, 2, 3, 4, 5, 6, 7, 9 (nicht bei 8)")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "7" })).toBeInTheDocument();
  });

  it("Live-Variante zeigt einen statischen Dealer-Bereich ohne Personen und ohne Video", async () => {
    render(
      <AppProviders>
        <BaccaratGame game={live} />
      </AppProviders>,
    );
    await tick(800);
    expect(screen.getByRole("img", { name: /keine Personen abgebildet/ })).toBeInTheDocument();
    expect(screen.getByText("Illustration — kein Video, keine Personen")).toBeInTheDocument();
  });

  it("weist je Wette den Erwartungswert der hinterlegten Tabelle aus", async () => {
    render(
      <AppProviders>
        <BaccaratGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    expect(screen.getByRole("radio", { name: /Spieler.*98,76 %/s })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Bank.*98,94 %/s })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Unentschieden.*85,64 %/s })).toBeInTheDocument();
    // Unterschiedliche Erwartungswerte ⇒ kein gemeinsamer Spiel-RTP (data/catalog.ts).
    expect(game.rtpDemo).toBeUndefined();
  });
});
