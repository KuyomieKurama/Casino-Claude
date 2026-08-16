import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { SCHEMA_VERSION, STORAGE_KEY } from "@/lib/constants";
import { games } from "@/data/games";
import { BlackjackGame } from "./BlackjackGame";
import { beginRound } from "./blackjack-logic";

/**
 * Rauchtest der Oberfläche: interaktive Runde vom Austeilen bis zum Abschluss über useRound,
 * Buchung des Zusatzeinsatzes beim Verdoppeln und dessen Ablehnung ohne Deckung.
 * Die Fachregeln selbst prüft blackjack-logic.test.ts.
 */

const game = games.find((g) => g.id === "g-classic-blackjack")!;
const live = games.find((g) => g.id === "g-live-blackjack-demo")!;
const STAKE = 100; // Voreinstellung der Engine, liegt im Demo-Bereich des Spiels

/** Erster Seed, dessen Startbild eine spielbare Hand ergibt (kein sofortiger Blackjack). */
const PLAYABLE_SEED = (() => {
  for (let seed = 1; seed < 10_000; seed++) {
    if (beginRound(seed, STAKE).phase === "player") return seed;
  }
  throw new Error("Kein spielbarer Seed gefunden.");
})();

/** Macht createSeed() deterministisch, damit die Runde im Test reproduzierbar ist. */
function fixSeed(seed: number) {
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView) => {
    new Uint32Array(array.buffer)[0] = seed;
    return array;
  }) as typeof globalThis.crypto.getRandomValues);
}

/** Schreibt einen Startkontostand in den persistierten Zustand, bevor die App hydriert. */
function seedBalance(demoBalanceMinor: number) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      wallet: {
        wallet: { demoBalanceMinor, bonusBalanceMinor: 0, freeSpins: 0, roundInFlight: false },
        transactions: [],
        nextSeq: 1,
        pendingRound: null,
      },
    }),
  );
}

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("BlackjackGame — Oberfläche und Wallet-Verdrahtung", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spielt eine Runde durch und bucht genau einmal", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    fixSeed(PLAYABLE_SEED);
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    expect(screen.getByText("Dealer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stehen bleiben" }));
    await tick(1500);
    expect(screen.getAllByText(/Rückgabe/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Karten geben/ })).toBeEnabled();
  });

  it("bucht beim Verdoppeln einen zweiten Einsatz vom Demo-Guthaben ab", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    fixSeed(PLAYABLE_SEED);
    seedBalance(100_000);
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    expect(screen.getByText(/Verfügbar: 999,00 Credits/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verdoppeln" }));
    // Zweiter Einsatz ist gebucht: Guthaben um einen weiteren Grundeinsatz gesunken
    expect(screen.getByText(/Verfügbar: 998,00 Credits/)).toBeInTheDocument();
    expect(screen.getByText(/Effektiver Gesamteinsatz dieser Runde: 2,00 Credits/)).toBeInTheDocument();
    await tick(1500);
    expect(screen.getByRole("button", { name: /Karten geben/ })).toBeEnabled();
  });

  it("lehnt das Verdoppeln ohne Deckung ab und lässt den Tisch unverändert", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    fixSeed(PLAYABLE_SEED);
    // Reicht für den Grundeinsatz, nicht für den Zusatzeinsatz beim Verdoppeln
    seedBalance(STAKE + 50);
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    expect(screen.getByText(/Verfügbar: 0,50 Credits/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verdoppeln" }));
    await tick(1500);
    // Kein Guthaben bewegt, Runde weiterhin offen, Aktionen weiterhin möglich
    expect(screen.getByText(/Verfügbar: 0,50 Credits/)).toBeInTheDocument();
    expect(screen.getByText(/Effektiver Gesamteinsatz dieser Runde: 1,00 Credits/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stehen bleiben" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Runde läuft/ })).toBeDisabled();
  });

  it("zeigt Regeln und Live-Illustration", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <AppProviders>
        <BlackjackGame game={live} />
      </AppProviders>,
    );
    await tick(800);
    expect(screen.getByLabelText("Illustration des Live-Tisches")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Regeln einblenden/ }));
    expect(screen.getByText(/Dealer zieht bis 17/)).toBeInTheDocument();
  });
});
