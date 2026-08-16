import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import type { EngineOutcome } from "@/types/engine";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY } from "@/lib/constants";
import { useRound } from "./useRound";

/**
 * Integrationstest der Rundenchoreografie, auf die sich ALLE Engines verlassen.
 * Geprüft wird die Verdrahtung useRound ↔ WalletContext ↔ Reducer — nicht die Darstellung
 * einer einzelnen Engine.
 */

const game: Game = {
  id: "g-neon-nights",
  slug: "neon-nights",
  name: "Testspiel",
  category: "slots",
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

function Harness({ outcome, interactive = false }: { outcome: EngineOutcome; interactive?: boolean }) {
  const round = useRound({
    game,
    resolve: () => outcome,
    roundDurationMs: 50,
    interactive,
    defaultStakeMinor: 100,
  });
  return (
    <div>
      <span data-testid="status">{round.status}</span>
      <span data-testid="balance">{round.wallet.demoBalanceMinor}</span>
      <span data-testid="net">{round.last ? round.last.netMinor : "—"}</span>
      <span data-testid="canstart">{String(round.canStart)}</span>
      <button onClick={() => round.play()}>spielen</button>
      <button onClick={() => round.start()}>starten</button>
      <button onClick={() => round.settle({ returnMinor: 250, outcomeKey: "x", outcomeLabel: "Interaktiv" })}>abschliessen</button>
      <button onClick={() => round.settle({ returnMinor: 999_999, outcomeKey: "x", outcomeLabel: "Zu viel" })}>zuviel</button>
      <span data-testid="error">{round.inlineError?.code ?? ""}</span>
    </div>
  );
}

const outcome = (returnMinor: number, max?: number): EngineOutcome => ({
  outcomeKey: "test",
  outcomeLabel: "Testergebnis",
  returnMinor,
  ...(max === undefined ? {} : { maxReturnMinor: max }),
});

const renderRound = (props: { outcome: EngineOutcome; interactive?: boolean }) =>
  render(
    <AppProviders>
      <Harness {...props} />
    </AppProviders>,
  );

/** Wartet, bis der Zustandsübergang nach dem Laden (700 ms) und der Runde durch ist. */
async function settleTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useRound — gemeinsame Rundenchoreografie", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("durchläuft laden → bereit → läuft → abgeschlossen und bucht genau einmal", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound({ outcome: outcome(200) });
    expect(screen.getByTestId("status").textContent).toBe("loading");
    await settleTimers(800);
    expect(screen.getByTestId("status").textContent).toBe("ready");
    const before = Number(screen.getByTestId("balance").textContent);

    await user.click(screen.getByText("spielen"));
    expect(screen.getByTestId("status").textContent).toBe("playing");
    await settleTimers(100);
    expect(screen.getByTestId("status").textContent).toBe("finished");
    expect(Number(screen.getByTestId("balance").textContent)).toBe(before - 100 + 200);
    expect(screen.getByTestId("net").textContent).toBe("100");
  });

  it("nimmt während einer laufenden Runde keine zweite an", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound({ outcome: outcome(0) });
    await settleTimers(800);
    const before = Number(screen.getByTestId("balance").textContent);
    await user.click(screen.getByText("spielen"));
    expect(screen.getByTestId("canstart").textContent).toBe("false");
    await user.click(screen.getByText("spielen"));
    await user.click(screen.getByText("spielen"));
    await settleTimers(100);
    // Genau ein Einsatz abgezogen, genau ein Ergebnis gutgeschrieben
    expect(Number(screen.getByTestId("balance").textContent)).toBe(before - 100);
  });

  /**
   * Regressionstest: Drei Klicks im SELBEN JS-Task, ohne Rerender dazwischen. Vorher meldete der
   * Wallet-Context dem Hook für alle drei Klicks „angenommen" (er rechnete auf einem veralteten
   * Zustand), während der Reducer nur den ersten annahm. Der Hook merkte sich dann die dritte,
   * nie gestartete Runde — der Abschluss lief ins Leere und das Spiel blieb dauerhaft auf
   * „playing" stehen, mit abgebuchtem Einsatz und ohne Ergebnis.
   */
  it("drei Klicks im selben Task: genau eine Runde, die auch abschließt", async () => {
    renderRound({ outcome: outcome(300) });
    await settleTimers(800);
    const before = Number(screen.getByTestId("balance").textContent);

    await act(async () => {
      const btn = screen.getByText("spielen");
      btn.click();
      btn.click();
      btn.click();
    });
    expect(screen.getByTestId("status").textContent).toBe("playing");

    await settleTimers(200);
    expect(screen.getByTestId("status").textContent, "Runde muss abschließen, nicht hängen bleiben").toBe("finished");
    expect(Number(screen.getByTestId("balance").textContent)).toBe(before - 100 + 300);
    expect(screen.getByTestId("net").textContent).toBe("200");
  });


  it("interaktive Runde: Ergebnis bis zur Obergrenze wird gebucht", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound({ outcome: outcome(0, 400), interactive: true });
    await settleTimers(800);
    const before = Number(screen.getByTestId("balance").textContent);
    await user.click(screen.getByText("starten"));
    await user.click(screen.getByText("abschliessen"));
    expect(Number(screen.getByTestId("balance").textContent)).toBe(before - 100 + 250);
    expect(screen.getByTestId("net").textContent).toBe("150");
  });

  it("interaktive Runde: Ergebnis über der Obergrenze wird abgelehnt und angezeigt", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderRound({ outcome: outcome(0, 400), interactive: true });
    await settleTimers(800);
    const before = Number(screen.getByTestId("balance").textContent);
    await user.click(screen.getByText("starten"));
    await user.click(screen.getByText("zuviel"));
    expect(screen.getByTestId("error").textContent).toBe("RETURN_OUT_OF_RANGE");
    expect(Number(screen.getByTestId("balance").textContent)).toBe(before - 100);
  });

  it("simulierter Ladefehler führt in den Fehlerzustand, Wiederholung lädt erneut", async () => {
    function ErrorHarness() {
      const round = useRound({ game, resolve: () => outcome(0), roundDurationMs: 10, simulateLoadError: true });
      return (
        <div>
          <span data-testid="status">{round.status}</span>
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
    expect(screen.getByTestId("status").textContent).toBe("error");
    await user.click(screen.getByText("erneut"));
    await settleTimers(800);
    expect(screen.getByTestId("status").textContent).toBe("ready");
  });
});
