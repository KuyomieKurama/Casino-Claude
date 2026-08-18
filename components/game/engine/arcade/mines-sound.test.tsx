import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY, START_BALANCE_MINOR } from "@/lib/constants";
import { games } from "@/data/catalog";
import type { SoundName } from "../sound/useEngineSound";
import { MinesGame } from "./MinesGame";
import { minePositions, minesMultiplier, minesReturnMinor, MINES_DEFAULT_COUNT, type MinesCount } from "./mines-logic";

/**
 * Klang-Verdrahtung von Mines (interaktive Engine) — insbesondere der wichtigste Test dieser
 * Aufgabe: Bei einer Rückgabe unter dem Einsatz (Mine getroffen, Rückgabe 0) wird "settle"
 * gespielt und niemals "win" (ENGINE-BRIEF.md, verbotenes Dark Pattern „Loss Disguised as Win").
 *
 * "@/components/sound/useSound" existiert inzwischen (paralleler Auftrag „Klang-Infrastruktur"
 * abgeschlossen); dieser Test mockt trotzdem weiterhin den lokalen Einstiegspunkt der Engines
 * (../sound/useEngineSound, reiner Re-Export), damit er unabhängig von Web-Audio-Interna bleibt
 * und ausschließlich die Verdrahtung dieser Engine prüft (Vorgabe „lokalen Mock anlegen").
 */

const played: SoundName[] = [];
let soundEnabled = true;

vi.mock("../sound/useEngineSound", () => ({
  useSound: () => ({
    play: (name: SoundName) => {
      if (soundEnabled) played.push(name); // simuliert den vertraglichen No-Op bei deaktiviertem Ton
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

/** Erster Seed, dessen Minenlayout Feld 0 (Zeile 1, Spalte 1) frei lässt. */
const MINES_SAFE_SEED = (() => {
  for (let seed = 1; seed < 10_000; seed++) {
    if (!minePositions(seed, MINES_DEFAULT_COUNT).includes(0)) return seed;
  }
  throw new Error("Kein Seed mit sicherem ersten Feld gefunden.");
})();

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/** Bildet server/rounds/interactive/mines-adapter.ts über fetch() nach (siehe arcade-view.test.tsx). */
function mockMinesRoutes(seed: number, mines: MinesCount, stakeMinor: number, startBalanceMinor: number) {
  const positions = minePositions(seed, mines);
  let revealed: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });

      if (url.toString().endsWith("/api/rounds/interactive-start")) {
        revealed = [];
        return json({
          status: "open",
          roundId: "r-mines-sound-test",
          gameModeId: "g-mines-demo",
          stakeMinor,
          maxReturnMinor: 999_999_999,
          betKey: `m${mines}`,
          usedFreeSpin: false,
          nextSeq: 1,
          state: { mines, status: "open", revealedCells: [], revealedCount: 0, multiplier: 0, cellsRemaining: 25 - mines },
          wallet: { demoBalanceMinor: startBalanceMinor - stakeMinor, bonusBalanceMinor: 0, freeSpins: 0 },
        });
      }

      if (url.toString().endsWith("/actions")) {
        const action = body.action as string;
        if (action === "reveal") {
          const cell = (body.payload as { cell: number }).cell;
          if (positions.includes(cell)) {
            return json({
              status: "settled",
              roundId: "r-mines-sound-test",
              nextSeq: revealed.length + 2,
              stakeMinor,
              returnMinor: 0,
              netMinor: -stakeMinor,
              outcomeKey: "mine",
              outcomeLabel: `Mine getroffen nach ${revealed.length} Feldern`,
              seed,
              state: {
                mines,
                status: "hit",
                revealedCells: revealed,
                revealedCount: revealed.length,
                multiplier: minesMultiplier(mines, revealed.length),
                cellsRemaining: 25 - mines - revealed.length,
                positions,
                hitCell: cell,
              },
              wallet: { demoBalanceMinor: startBalanceMinor - stakeMinor, bonusBalanceMinor: 0, freeSpins: 0 },
            });
          }
          revealed = [...revealed, cell];
          return json({
            status: "open",
            roundId: "r-mines-sound-test",
            nextSeq: revealed.length + 1,
            stakeMinor,
            state: {
              mines,
              status: "open",
              revealedCells: revealed,
              revealedCount: revealed.length,
              multiplier: minesMultiplier(mines, revealed.length),
              cellsRemaining: 25 - mines - revealed.length,
            },
            wallet: { demoBalanceMinor: startBalanceMinor - stakeMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          });
        }
        if (action === "cashOut") {
          const returnMinor = minesReturnMinor(stakeMinor, mines, revealed.length);
          return json({
            status: "settled",
            roundId: "r-mines-sound-test",
            nextSeq: revealed.length + 2,
            stakeMinor,
            returnMinor,
            netMinor: returnMinor - stakeMinor,
            outcomeKey: "cashout",
            outcomeLabel: `Ausgezahlt nach ${revealed.length} Feldern`,
            seed,
            state: {
              mines,
              status: "cashedOut",
              revealedCells: revealed,
              revealedCount: revealed.length,
              multiplier: minesMultiplier(mines, revealed.length),
              cellsRemaining: 25 - mines - revealed.length,
              positions,
              hitCell: null,
            },
            wallet: { demoBalanceMinor: startBalanceMinor - stakeMinor + returnMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          });
        }
      }
      throw new Error(`mockMinesRoutes: unerwarteter Aufruf ${String(url)}`);
    }),
  );
}

describe("MinesGame — Klang", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    played.length = 0;
    soundEnabled = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("spielt bei einer Mine (Rückgabe 0, unter dem Einsatz) 'settle' und niemals 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const stake = 100;
    const positions = minePositions(MINES_SAFE_SEED, MINES_DEFAULT_COUNT);
    const mineCell = positions[0]!;
    mockMinesRoutes(MINES_SAFE_SEED, MINES_DEFAULT_COUNT, stake, START_BALANCE_MINOR);
    render(
      <AppProviders>
        <MinesGame game={gameById("g-mines-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    await tick(0);

    const grid = screen.getByRole("group", { name: "Spielfeld" });
    const row = Math.floor(mineCell / 5) + 1;
    const column = (mineCell % 5) + 1;
    const button = within(grid).getByRole("button", { name: new RegExp(`^Feld Zeile ${row}, Spalte ${column}`) });
    await user.click(button);
    await tick(1500);

    expect(played).toContain("settle");
    expect(played).not.toContain("win");
  });

  it("spielt bei echtem Netto-Gewinn (Auszahlung über dem Einsatz) 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const stake = 100;
    mockMinesRoutes(MINES_SAFE_SEED, MINES_DEFAULT_COUNT, stake, START_BALANCE_MINOR);
    render(
      <AppProviders>
        <MinesGame game={gameById("g-mines-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    await tick(0);

    const grid = screen.getByRole("group", { name: "Spielfeld" });
    const safeButton = within(grid).getByRole("button", { name: /^Feld Zeile 1, Spalte 1/ });
    await user.click(safeButton);
    await tick(0);

    const cashOut = screen.getByRole("button", { name: /Auszahlen — Rückgabe/ });
    await user.click(cashOut);
    await tick(1500);

    expect(played).toContain("win");
    expect(played).not.toContain("settle");
  });

  it("spielt 'click' beim Aufdecken eines sicheren Feldes direkt neben einer Mine — ohne zusätzlichen Ton für den Beinahe-Treffer", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const stake = 100;
    mockMinesRoutes(MINES_SAFE_SEED, MINES_DEFAULT_COUNT, stake, START_BALANCE_MINOR);
    render(
      <AppProviders>
        <MinesGame game={gameById("g-mines-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    await tick(0);
    played.length = 0; // nur das Aufdecken selbst beobachten, nicht den Rundenstart

    const grid = screen.getByRole("group", { name: "Spielfeld" });
    const safeButton = within(grid).getByRole("button", { name: /^Feld Zeile 1, Spalte 1/ });
    await user.click(safeButton);
    await tick(0);

    // Ein sicheres Feld — auch eines direkt neben einer Mine — löst ausschließlich "click" aus,
    // nie einen zusätzlichen, betonenden Ton für die Nähe zur Mine (kein Near Miss, Regel 7).
    expect(played).toEqual(["click"]);
  });

  it("spielt nichts, wenn Ton deaktiviert ist (über den gemockten Hook geprüft)", async () => {
    soundEnabled = false;
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const stake = 100;
    const positions = minePositions(MINES_SAFE_SEED, MINES_DEFAULT_COUNT);
    const mineCell = positions[0]!;
    mockMinesRoutes(MINES_SAFE_SEED, MINES_DEFAULT_COUNT, stake, START_BALANCE_MINOR);
    render(
      <AppProviders>
        <MinesGame game={gameById("g-mines-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    await tick(0);

    const grid = screen.getByRole("group", { name: "Spielfeld" });
    const row = Math.floor(mineCell / 5) + 1;
    const column = (mineCell % 5) + 1;
    const button = within(grid).getByRole("button", { name: new RegExp(`^Feld Zeile ${row}, Spalte ${column}`) });
    await user.click(button);
    await tick(1500);

    // Die Runde läuft normal weiter (Klang ist reine Ergänzung, nie die einzige Rückmeldung).
    expect(screen.getAllByText(/Mine getroffen/).length).toBeGreaterThan(0);
    expect(played).toEqual([]);
  });
});
