import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY, ROUND_DURATION_MS } from "@/lib/constants";
import { games } from "@/data/catalog";
import type { SoundName } from "../sound/useEngineSound";
import { DiceGame } from "./DiceGame";

/**
 * Klang-Verdrahtung von Dice (nicht-interaktive Engine) — zweite Engine für den wichtigsten Test
 * dieser Aufgabe (die erste ist Mines, interaktiv): Bei einer Rückgabe unter dem Einsatz wird
 * "settle" gespielt und niemals "win", auch dann nicht, wenn der Wurf nur knapp daneben liegt
 * (Regel 7: kein Near Miss). Zusätzlich: "chip" bei Einsatzänderung (GameShell) und Stille bei
 * deaktiviertem Ton.
 */

const played: SoundName[] = [];
let soundEnabled = true;

vi.mock("../sound/useEngineSound", () => ({
  useSound: () => ({
    play: (name: SoundName) => {
      if (soundEnabled) played.push(name);
    },
    enabled: soundEnabled,
    setEnabled: vi.fn(),
    volume: soundEnabled ? 1 : 0,
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

function mockRoundResponse(data: { returnMinor: number; netMinor: number; outcomeKey: string; outcomeLabel: string; betKey?: string; detail?: Record<string, unknown>; balanceMinor: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            roundId: "r-dice-sound-test",
            gameModeId: "g-dice-demo",
            stakeMinor: 100,
            returnMinor: data.returnMinor,
            netMinor: data.netMinor,
            outcomeKey: data.outcomeKey,
            outcomeLabel: data.outcomeLabel,
            seed: 1,
            usedFreeSpin: false,
            betKey: data.betKey ?? null,
            ...(data.detail ? { detail: data.detail } : {}),
            wallet: { balanceMinor: data.balanceMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
}

describe("DiceGame — Klang", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    played.length = 0;
    soundEnabled = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("spielt bei einem knapp verfehlten Wurf (Rückgabe 0, unter dem Einsatz) 'settle' und niemals 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Voreingestellt: "Über 50", Trefferbereich 51–100. Wurf 50 verfehlt knapp — Regel 7 verbietet
    // jede Betonung dieses Beinahe-Treffers, klanglich bekommt er nur den normalen Verlustton.
    mockRoundResponse({
      returnMinor: 0,
      netMinor: -100,
      outcomeKey: "lose",
      outcomeLabel: "Kein Treffer — Wurf 50",
      betKey: "over-50",
      detail: { roll: 50, betId: "over-50", win: false },
      balanceMinor: 99_900,
    });
    render(
      <AppProviders>
        <DiceGame game={gameById("g-dice-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Würfeln/ }));
    await tick(ROUND_DURATION_MS + 50);

    expect(played).toContain("settle");
    expect(played).not.toContain("win");
  });

  it("spielt bei echtem Netto-Gewinn 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRoundResponse({
      returnMinor: 194,
      netMinor: 94,
      outcomeKey: "win",
      outcomeLabel: "Treffer — Wurf 80",
      betKey: "over-50",
      detail: { roll: 80, betId: "over-50", win: true },
      balanceMinor: 100_094,
    });
    render(
      <AppProviders>
        <DiceGame game={gameById("g-dice-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Würfeln/ }));
    await tick(ROUND_DURATION_MS + 50);

    expect(played).toContain("win");
    expect(played).not.toContain("settle");
  });

  it("spielt 'chip', wenn der Einsatz über die Shell-Bedienung geändert wird", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AppProviders>
        <DiceGame game={gameById("g-dice-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Einsatz erhöhen" }));
    expect(played).toContain("chip");
  });

  it("spielt nichts, wenn Ton deaktiviert ist — weder Einsatzänderung noch Rundenergebnis", async () => {
    soundEnabled = false;
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRoundResponse({
      returnMinor: 194,
      netMinor: 94,
      outcomeKey: "win",
      outcomeLabel: "Treffer — Wurf 80",
      betKey: "over-50",
      detail: { roll: 80, betId: "over-50", win: true },
      balanceMinor: 100_094,
    });
    render(
      <AppProviders>
        <DiceGame game={gameById("g-dice-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Einsatz erhöhen" }));
    await user.click(screen.getByRole("button", { name: /Würfeln/ }));
    await tick(ROUND_DURATION_MS + 50);

    // Die Information bleibt trotzdem sichtbar (Klang ist nur Ergänzung, nie alleinige Rückmeldung).
    expect(screen.getAllByText(/Wurf 80/).length).toBeGreaterThan(0);
    expect(played).toEqual([]);
  });
});
