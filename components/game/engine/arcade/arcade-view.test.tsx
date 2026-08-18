import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY, ROUND_DURATION_MS } from "@/lib/constants";
import { games } from "@/data/catalog";
import { PlinkoGame } from "./PlinkoGame";
import { MinesGame } from "./MinesGame";
import { DiceGame } from "./DiceGame";
import { WheelGame } from "./WheelGame";
import { minePositions, MINES_DEFAULT_COUNT } from "./mines-logic";

/**
 * Rauchtest der vier Oberflächen: Verdrahtung mit useRound und GameShell, nicht das Aussehen.
 * Geprüft wird vor allem der interaktive Ablauf bei Mines (Start → Aufdecken → Auszahlen), weil
 * dort die Oberfläche den Betrag bestimmt und der Wallet-Reducer ihn gegen die deklarierte
 * Obergrenze prüft.
 */

function gameById(id: string): Game {
  const game = games.find((g) => g.id === id);
  if (!game) throw new Error(`Spiel ${id} fehlt im Katalog`);
  return game;
}

/**
 * Erster Seed, dessen Minenlayout das zuerst geprüfte Feld (Zeile 1, Spalte 1 = Index 0) frei
 * lässt. Der Rundenseed ist sonst zufällig (createSeed() in lib/rng.ts), wodurch das im Test
 * zuerst aufgedeckte Feld je nach Lauf eine Mine treffen konnte — dann erscheint der Text
 * „Mine getroffen" an mehreren Stellen im DOM (Statuszeile, Ergebniszeile, Rundenhistorie) und
 * getByText(/Mine getroffen/) wird mehrdeutig. Gleicher Seed erzeugt laut ENGINE-BRIEF.md
 * immer dasselbe Ergebnis, also lässt sich ein garantiert sicheres erstes Feld vorab bestimmen,
 * statt sich auf den Zufall zu verlassen (analog zu PLAYABLE_SEED in BlackjackGame.test.tsx).
 */
const MINES_SAFE_SEED = (() => {
  for (let seed = 1; seed < 10_000; seed++) {
    if (!minePositions(seed, MINES_DEFAULT_COUNT).includes(0)) return seed;
  }
  throw new Error("Kein Seed mit sicherem ersten Feld gefunden.");
})();

/** Macht createSeed() deterministisch — gleiches Muster wie BlackjackGame.test.tsx. */
function fixSeed(seed: number) {
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView) => {
    new Uint32Array(array.buffer)[0] = seed;
    return array;
  }) as typeof globalThis.crypto.getRandomValues);
}

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function balanceMinor(): number {
  const text = screen.getByText(/Verfügbar:/).textContent ?? "";
  const digits = text.replace(/[^\d,]/g, "").replace(",", "");
  return Number(digits);
}

/**
 * Plinko, Wheel und Dice lösen ihre Runde seit Phase 3a serverseitig auf (POST
 * /api/rounds/start, siehe components/game/engine/useRound.ts `server: true`) — `fetch` wird
 * deshalb hier gemockt, mit genau der Antwortform, die server/rounds/round-service.ts liefert.
 * Mines bleibt interaktiv und lokal (unverändert, kein Mock nötig).
 */
function mockRoundResponse(data: {
  returnMinor: number;
  netMinor: number;
  outcomeKey: string;
  outcomeLabel: string;
  betKey?: string;
  detail?: Record<string, unknown>;
  demoBalanceMinor: number;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            roundId: "r-test",
            gameModeId: "g-test",
            stakeMinor: 100,
            returnMinor: data.returnMinor,
            netMinor: data.netMinor,
            outcomeKey: data.outcomeKey,
            outcomeLabel: data.outcomeLabel,
            seed: 1,
            usedFreeSpin: false,
            betKey: data.betKey ?? null,
            ...(data.detail ? { detail: data.detail } : {}),
            wallet: { demoBalanceMinor: data.demoBalanceMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
}

describe("Arcade-Oberflächen", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    // Stellt crypto.getRandomValues() wieder her, falls fixSeed() im Mines-Test gespiegelt hat,
    // und entfernt den fetch()-Mock der Plinko/Wheel/Dice-Tests.
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("Plinko: eine Runde läuft durch und zeigt Fach und Weg", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRoundResponse({
      returnMinor: 200,
      netMinor: 100,
      outcomeKey: "mid",
      outcomeLabel: "Mitte · 2×",
      detail: { path: "LRLRLRLRLRLR", bucket: 6 },
      demoBalanceMinor: 100_200,
    });
    render(
      <AppProviders>
        <PlinkoGame game={gameById("g-plinko-demo")} />
      </AppProviders>,
    );
    await tick(800);
    const before = balanceMinor();
    await user.click(screen.getByRole("button", { name: /Kugel fallen lassen/ }));
    await tick(ROUND_DURATION_MS + 50);
    expect(screen.getByText(/Getroffen: Fach/)).toBeInTheDocument();
    expect(screen.getByText(/Weg der Kugel:/)).toBeInTheDocument();
    expect(balanceMinor()).toBeLessThanOrEqual(before + 24 * 100);
  });

  it("Wheel: eine Runde benennt das getroffene Segment", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRoundResponse({
      returnMinor: 200,
      netMinor: 100,
      outcomeKey: "seg-3",
      outcomeLabel: "Segment 4 · 2×",
      detail: { index: 3 },
      demoBalanceMinor: 100_200,
    });
    render(
      <AppProviders>
        <WheelGame game={gameById("g-wheel-demo")} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Rad drehen/ }));
    await tick(ROUND_DURATION_MS + 50);
    expect(screen.getByText(/Getroffen: Segment \d+ · /)).toBeInTheDocument();
  });

  it("Dice: Richtung und Stufe ändern die Wette", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockRoundResponse({
      returnMinor: 970,
      netMinor: 870,
      outcomeKey: "win",
      outcomeLabel: "Treffer — Wurf 7",
      betKey: "under-11",
      detail: { roll: 7, betId: "under-11", win: true },
      demoBalanceMinor: 100_870,
    });
    render(
      <AppProviders>
        <DiceGame game={gameById("g-dice-demo")} />
      </AppProviders>,
    );
    await tick(800);
    expect(screen.getByText(/Gewählt: Über 50/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Unter/ }));
    await user.click(screen.getByRole("button", { name: /^10 %/ }));
    expect(screen.getByText(/Gewählt: Unter 11/)).toBeInTheDocument();
    expect(screen.getByText(/Auszahlung 9,7×/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Würfeln/ }));
    await tick(ROUND_DURATION_MS + 50);
    // „Wurf 7 · …“ steht in der Spielfläche und zusätzlich in der Ergebniszeile der Shell.
    expect(screen.getAllByText(/Wurf \d+ · /).length).toBeGreaterThan(0);
  });

  it("Mines: Runde starten, Feld aufdecken, auszahlen — der Betrag bleibt in der Obergrenze", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Deterministischer Seed statt zufälligem Startseed (Begründung: siehe MINES_SAFE_SEED oben).
    fixSeed(MINES_SAFE_SEED);
    render(
      <AppProviders>
        <MinesGame game={gameById("g-mines-demo")} />
      </AppProviders>,
    );
    await tick(800);
    const before = balanceMinor();
    const stake = 100;

    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    expect(balanceMinor()).toBe(before - stake);
    // Einsatz ist während der offenen Runde gesperrt.
    expect(screen.getByRole("button", { name: "Einsatz erhöhen" })).toBeDisabled();

    const grid = screen.getByRole("group", { name: "Spielfeld" });
    let revealedSafe = false;
    for (let cell = 0; cell < 25 && !revealedSafe; cell++) {
      const row = Math.floor(cell / 5) + 1;
      const column = (cell % 5) + 1;
      const button = within(grid).getByRole("button", { name: new RegExp(`^Feld Zeile ${row}, Spalte ${column}`) });
      if ((button as HTMLButtonElement).disabled) break;
      await user.click(button);
      const label = button.getAttribute("aria-label") ?? "";
      if (label.includes("frei")) revealedSafe = true;
      else break; // Mine — die Runde ist beendet
    }

    // MINES_SAFE_SEED garantiert ein freies erstes Feld — bricht der Test hier ab, ist die
    // Determinismus-Annahme (gleicher Seed ⇒ gleiche Minenpositionen) verletzt.
    expect(revealedSafe).toBe(true);

    if (revealedSafe) {
      const cashOut = screen.getByRole("button", { name: /Auszahlen — Rückgabe/ });
      await user.click(cashOut);
      const after = balanceMinor();
      expect(after).toBeGreaterThan(before - stake);
      // Höchstens die Obergrenze (alle 22 freien Felder bei 3 Minen): 2231 × Einsatz
      expect(after).toBeLessThanOrEqual(before - stake + 2231 * stake);
    } else {
      expect(balanceMinor()).toBe(before - stake);
      expect(screen.getByText(/Mine getroffen/)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Runde starten" })).toBeInTheDocument();
  });
});
