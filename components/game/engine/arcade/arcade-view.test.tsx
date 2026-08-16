import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("Arcade-Oberflächen", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("Plinko: eine Runde läuft durch und zeigt Fach und Weg", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
    // „Wurf 47 · …“ steht in der Spielfläche und zusätzlich in der Ergebniszeile der Shell.
    expect(screen.getAllByText(/Wurf \d+ · /).length).toBeGreaterThan(0);
  });

  it("Mines: Runde starten, Feld aufdecken, auszahlen — der Betrag bleibt in der Obergrenze", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
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
