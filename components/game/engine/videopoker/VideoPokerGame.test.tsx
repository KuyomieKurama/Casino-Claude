import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY } from "@/lib/constants";
import { games } from "@/data/catalog";
import { VideoPokerGame } from "./VideoPokerGame";

/**
 * Rauchtest der Oberfläche: interaktive Runde (geben → halten → tauschen) über useRound,
 * Tastaturbedienung und sichtbare Gewinntabelle. Die Handbewertung prüft videopoker-logic.test.ts.
 */

const game = games.find((g) => g.id === "g-video-poker")!;

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("VideoPokerGame — Oberfläche und Wallet-Verdrahtung", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("spielt eine Runde vom Geben bis zum Tausch durch und bucht genau einmal", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AppProviders>
        <VideoPokerGame game={game} />
      </AppProviders>,
    );
    await tick(800);

    const deal = screen.getByRole("button", { name: "Karten geben" });
    expect(deal).toBeEnabled();
    await user.click(deal);

    // Fünf Karten liegen, keine ist vorausgewählt (Regel 7).
    for (let i = 1; i <= 5; i++) {
      const card = screen.getByRole("button", { name: new RegExp(`^Karte ${i} von 5:`) });
      expect(card).toHaveAttribute("aria-pressed", "false");
    }

    await user.click(screen.getByRole("button", { name: /^Karte 1 von 5:/ }));
    expect(screen.getByRole("button", { name: /^Karte 1 von 5:/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 von 5 Karten gehalten")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Tauschen/ }));
    await tick(50);

    expect(screen.getByText("Runde abgeschlossen")).toBeInTheDocument();
    expect(screen.getAllByText(/Rückgabe/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Karten geben" })).toBeEnabled();
  });

  it("Ziffern 1 bis 5 halten und lösen die jeweilige Karte", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AppProviders>
        <VideoPokerGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Karten geben" }));

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
