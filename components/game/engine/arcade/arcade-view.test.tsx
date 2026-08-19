import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Game } from "@/types/game";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY, ROUND_DURATION_MS, START_BALANCE_MINOR } from "@/lib/constants";
import { games } from "@/data/catalog";
import { PlinkoGame } from "./PlinkoGame";
import { MinesGame } from "./MinesGame";
import { DiceGame } from "./DiceGame";
import { WheelGame } from "./WheelGame";
import { minePositions, minesMultiplier, minesReturnMinor, MINES_DEFAULT_COUNT, type MinesCount } from "./mines-logic";

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
 * lässt — nur noch für den serverseitigen Fetch-Mock unten gebraucht (Phase 3b: Mines läuft
 * nicht mehr lokal, der Seed entsteht ausschließlich im Server, siehe mockMinesRoutes()).
 * Gleicher Seed erzeugt laut ENGINE-BRIEF.md immer dasselbe Ergebnis, also lässt sich ein
 * garantiert sicheres erstes Feld vorab bestimmen, statt sich auf den Zufall zu verlassen.
 */
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
  balanceMinor: number;
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
            wallet: { balanceMinor: data.balanceMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
}

/**
 * Mines läuft seit Phase 3b serverseitig (POST /api/rounds/interactive-start, POST
 * /api/rounds/:id/actions, siehe components/game/engine/useRound.ts). Dieser Mock antwortet mit
 * genau den Feldern, die server/rounds/interactive/mines-adapter.ts liefert — Minenpositionen und
 * das getroffene Feld erst NACH Rundenende, wie in der echten Sichtbarkeitsgrenze. Berechnungen
 * (Multiplikator, Rückgabe) laufen über dieselben unveränderten Funktionen aus mines-logic.ts,
 * die auch der Server verwendet.
 */
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
          roundId: "r-mines-test",
          gameModeId: "g-mines-demo",
          stakeMinor,
          maxReturnMinor: 999_999_999,
          betKey: `m${mines}`,
          usedFreeSpin: false,
          nextSeq: 1,
          state: { mines, status: "open", revealedCells: [], revealedCount: 0, multiplier: 0, cellsRemaining: 25 - mines },
          wallet: { balanceMinor: startBalanceMinor - stakeMinor, bonusBalanceMinor: 0, freeSpins: 0 },
        });
      }

      if (url.toString().endsWith("/actions")) {
        const action = body.action as string;
        if (action === "reveal") {
          const cell = (body.payload as { cell: number }).cell;
          if (positions.includes(cell)) {
            return json({
              status: "settled",
              roundId: "r-mines-test",
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
              wallet: { balanceMinor: startBalanceMinor - stakeMinor, bonusBalanceMinor: 0, freeSpins: 0 },
            });
          }
          revealed = [...revealed, cell];
          return json({
            status: "open",
            roundId: "r-mines-test",
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
            wallet: { balanceMinor: startBalanceMinor - stakeMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          });
        }
        if (action === "cashOut") {
          const returnMinor = minesReturnMinor(stakeMinor, mines, revealed.length);
          return json({
            status: "settled",
            roundId: "r-mines-test",
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
            wallet: { balanceMinor: startBalanceMinor - stakeMinor + returnMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          });
        }
      }
      throw new Error(`mockMinesRoutes: unerwarteter Aufruf ${String(url)}`);
    }),
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
      balanceMinor: 100_200,
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
      balanceMinor: 100_200,
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
      balanceMinor: 100_870,
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
    const stake = 100;
    // Muss mit dem CLIENT-seitigen Default-Startguthaben übereinstimmen (state/wallet-reducer.ts,
    // hydriert hier ohne walletSnapshot-Prop) — sonst weicht der gemockte „Server“-Saldo nach dem
    // ersten Rundenstart-Sync (useRound.ts::syncServerWallet) vom vor dem Klick angezeigten
    // Anfangswert ab.
    const startBalanceMinor = START_BALANCE_MINOR;
    // Deterministischer Seed statt eines vom Server erzeugten Zufallsseeds (Begründung: siehe
    // MINES_SAFE_SEED oben) — der Mock antwortet mit genau dem Zustand, den ein echter Server bei
    // diesem Seed liefern würde (Phase 3b: Mines läuft serverseitig, kein lokaler Zufall mehr).
    mockMinesRoutes(MINES_SAFE_SEED, MINES_DEFAULT_COUNT, stake, startBalanceMinor);
    render(
      <AppProviders>
        <MinesGame game={gameById("g-mines-demo")} />
      </AppProviders>,
    );
    await tick(800);
    const before = balanceMinor();

    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    await tick(0); // Promise-Kette (fetch + response.json()) durchlaufen lassen, siehe useRound.interactive-server.test.tsx.
    expect(balanceMinor()).toBe(before - stake);
    // Einsatz ist während der offenen Runde gesperrt.
    expect(screen.getByRole("button", { name: "Einsatz erhöhen" })).toBeDisabled();

    const grid = screen.getByRole("group", { name: "Spielfeld" });
    // MINES_SAFE_SEED garantiert, dass Feld 0 (Zeile 1, Spalte 1) sicher ist.
    const button = within(grid).getByRole("button", { name: /^Feld Zeile 1, Spalte 1/ });
    await user.click(button);
    await tick(0);
    expect(button.getAttribute("aria-label")).toContain("frei");

    const cashOut = screen.getByRole("button", { name: /Auszahlen — Rückgabe/ });
    await user.click(cashOut);
    await tick(ROUND_DURATION_MS + 50);
    const after = balanceMinor();
    expect(after).toBeGreaterThan(before - stake);
    // Höchstens die Obergrenze (alle 22 freien Felder bei 3 Minen): 2231 × Einsatz
    expect(after).toBeLessThanOrEqual(before - stake + 2231 * stake);
    expect(screen.getByRole("button", { name: "Runde starten" })).toBeInTheDocument();
  });

  it("Mines: eine getroffene Mine beendet die Runde ohne Rückgabe und zeigt danach alle Minen", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const stake = 100;
    // Muss mit dem CLIENT-seitigen Default-Startguthaben übereinstimmen (state/wallet-reducer.ts,
    // hydriert hier ohne walletSnapshot-Prop) — sonst weicht der gemockte „Server“-Saldo nach dem
    // ersten Rundenstart-Sync (useRound.ts::syncServerWallet) vom vor dem Klick angezeigten
    // Anfangswert ab.
    const startBalanceMinor = START_BALANCE_MINOR;
    const positions = minePositions(MINES_SAFE_SEED, MINES_DEFAULT_COUNT);
    const mineCell = positions[0]!;
    mockMinesRoutes(MINES_SAFE_SEED, MINES_DEFAULT_COUNT, stake, startBalanceMinor);
    render(
      <AppProviders>
        <MinesGame game={gameById("g-mines-demo")} />
      </AppProviders>,
    );
    await tick(800);
    const before = balanceMinor();

    await user.click(screen.getByRole("button", { name: "Runde starten" }));
    await tick(0);

    const grid = screen.getByRole("group", { name: "Spielfeld" });
    const row = Math.floor(mineCell / 5) + 1;
    const column = (mineCell % 5) + 1;
    const button = within(grid).getByRole("button", { name: new RegExp(`^Feld Zeile ${row}, Spalte ${column}`) });
    await user.click(button);
    await tick(ROUND_DURATION_MS + 50);

    expect(balanceMinor()).toBe(before - stake); // keine Rückgabe
    // "Mine getroffen" erscheint sowohl in der Statuszeile der Spielfläche als auch in der
    // Ergebniszeile der Shell — mehrdeutig für getByText, deshalb getAllByText.
    expect(screen.getAllByText(/Mine getroffen/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Runde starten" })).toBeInTheDocument();
  });
});
