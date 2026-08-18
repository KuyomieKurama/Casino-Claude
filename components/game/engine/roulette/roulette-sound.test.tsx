import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY, ROUND_DURATION_MS } from "@/lib/constants";
import { games } from "@/data/catalog";
import type { SoundName } from "../sound/useEngineSound";
import { RouletteGame } from "./RouletteGame";

/**
 * Klang-Verdrahtung von Roulette: "stop" beim Anhalten des Kessels, danach "win"/"settle" je nach
 * Netto-Ergebnis — nie "win" bei Rückgabe unter dem Einsatz. RouletteGame.tsx hatte bislang keinen
 * eigenen Oberflächentest; dieser Test deckt zugleich die grundsätzliche Lauffähigkeit ab.
 */

const played: SoundName[] = [];

vi.mock("../sound/useEngineSound", () => ({
  useSound: () => ({
    play: (name: SoundName) => {
      played.push(name);
    },
    enabled: true,
    setEnabled: vi.fn(),
    volume: 1,
    setVolume: vi.fn(),
  }),
}));

function gameById(id: string): Game {
  const game = games.find((g) => g.id === id);
  if (!game) throw new Error(`Spiel ${id} fehlt im Katalog`);
  return game;
}

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function mockRoundResponse(data: { returnMinor: number; netMinor: number; outcomeKey: string; outcomeLabel: string; detail: Record<string, unknown>; balanceMinor: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            roundId: "r-roulette-sound-test",
            gameModeId: "g-european-roulette",
            stakeMinor: 100,
            returnMinor: data.returnMinor,
            netMinor: data.netMinor,
            outcomeKey: data.outcomeKey,
            outcomeLabel: data.outcomeLabel,
            seed: 1,
            usedFreeSpin: false,
            betKey: "red",
            detail: data.detail,
            wallet: { demoBalanceMinor: data.balanceMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
}

describe("RouletteGame — Klang", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    played.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("spielt 'stop' und danach 'settle' bei Rückgabe unter dem Einsatz — niemals 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Standardwette ist "Rot" (36:1... eigentlich 1:1), Kugel landet auf Schwarz ⇒ Totalverlust.
    mockRoundResponse({
      returnMinor: 0,
      netMinor: -100,
      outcomeKey: "lose",
      outcomeLabel: "Schwarz 15",
      detail: { pocket: "15" },
      balanceMinor: 99_900,
    });
    render(
      <AppProviders>
        <RouletteGame game={gameById("g-european-roulette")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Kugel werfen/ }));
    await tick(ROUND_DURATION_MS + 50);

    expect(played).toContain("stop");
    expect(played).toContain("settle");
    expect(played).not.toContain("win");
  });

  it("spielt bei echtem Netto-Gewinn 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRoundResponse({
      returnMinor: 200,
      netMinor: 100,
      outcomeKey: "win",
      outcomeLabel: "Rot 32",
      detail: { pocket: "32" },
      balanceMinor: 100_100,
    });
    render(
      <AppProviders>
        <RouletteGame game={gameById("g-european-roulette")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Kugel werfen/ }));
    await tick(ROUND_DURATION_MS + 50);

    expect(played).toContain("win");
    expect(played).not.toContain("settle");
  });
});
