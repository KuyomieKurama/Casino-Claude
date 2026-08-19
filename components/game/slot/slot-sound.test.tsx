import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY, ROUND_DURATION_MS } from "@/lib/constants";
import { games } from "@/data/catalog";
import type { SoundName } from "@/components/game/engine/sound/useEngineSound";
import { SlotGame } from "./SlotGame";

/**
 * Klang-Verdrahtung der Slot-Engine: "stop" beim Anhalten der Walzen, danach "win"/"settle" je
 * nach Netto-Ergebnis — der wichtigste Test dieser Aufgabe (siehe Mines/Dice/Blackjack) noch
 * einmal an dritter/vierter Stelle bestätigt: eine Rückgabe unter dem Einsatz bekommt "settle",
 * niemals "win". SlotGame.tsx hatte bislang keinen eigenen Oberflächentest.
 */

const played: SoundName[] = [];

vi.mock("@/components/game/engine/sound/useEngineSound", () => ({
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

function mockRoundResponse(data: { returnMinor: number; netMinor: number; outcomeKey: string; outcomeLabel: string; balanceMinor: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            roundId: "r-slot-sound-test",
            gameModeId: "g-classic-fruit",
            stakeMinor: 100,
            returnMinor: data.returnMinor,
            netMinor: data.netMinor,
            outcomeKey: data.outcomeKey,
            outcomeLabel: data.outcomeLabel,
            seed: 1,
            usedFreeSpin: false,
            betKey: null,
            wallet: { balanceMinor: data.balanceMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
}

describe("SlotGame — Klang", () => {
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
    mockRoundResponse({ returnMinor: 0, netMinor: -100, outcomeKey: "none", outcomeLabel: "Keine Kombination", balanceMinor: 99_900 });
    render(
      <AppProviders>
        <SlotGame game={gameById("g-classic-fruit")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    await tick(ROUND_DURATION_MS + 50);

    expect(played).toContain("stop");
    expect(played).toContain("settle");
    expect(played).not.toContain("win");
  });

  it("spielt bei echtem Netto-Gewinn 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRoundResponse({ returnMinor: 300, netMinor: 200, outcomeKey: "three-kind", outcomeLabel: "Drei gleiche", balanceMinor: 100_200 });
    render(
      <AppProviders>
        <SlotGame game={gameById("g-classic-fruit")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    await tick(ROUND_DURATION_MS + 50);

    expect(played).toContain("win");
    expect(played).not.toContain("settle");
  });
});
