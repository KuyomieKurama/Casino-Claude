import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY } from "@/lib/constants";
import { games } from "@/data/games";
import type { SoundName } from "../sound/useEngineSound";
import { BlackjackGame } from "./BlackjackGame";

/**
 * Klang-Verdrahtung von Blackjack (zweite interaktive Engine) — deckt "card" (Austeilen), "click"
 * (Spieleraktionen), den Push-Sonderfall (netMinor genau 0 ⇒ "settle", nicht "win" — derselbe
 * Verlustfall-Test wie bei Mines/Dice, hier über einen realen Push statt eines Totalverlusts),
 * echten Netto-Gewinn ("win") und "error" bei einer abgelehnten Aktion ab. Die Fachregeln selbst
 * prüft blackjack-logic.test.ts; dieser Test kontrolliert die Server-Antworten direkt, um jeden
 * Fall gezielt auszulösen, statt ihn über einen echten Seed zu suchen.
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

const game = games.find((g) => g.id === "g-classic-blackjack")!;
const STAKE = 100;

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

const openState = {
  dealer: [{ rank: "7", suit: "spades" }],
  hands: [{ cards: [{ rank: "9", suit: "hearts" }, { rank: "8", suit: "clubs" }], betMinor: STAKE, doubled: false, fromSplit: false, splitAces: false, done: false }],
  activeHand: 0,
  phase: "player" as const,
  baseBetMinor: STAKE,
};

function json(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
}

/** Deal-Antwort, immer offen (phase "player") — die Fachregeln sind hier irrelevant, nur die Verdrahtung wird geprüft. */
function mockDeal() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.toString().endsWith("/api/rounds/interactive-start")) {
        return json({
          status: "open",
          roundId: "r-bj-sound-test",
          gameModeId: "g-classic-blackjack",
          stakeMinor: STAKE,
          maxReturnMinor: STAKE * 5,
          betKey: null,
          usedFreeSpin: false,
          nextSeq: 1,
          state: openState,
          wallet: { demoBalanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
        });
      }
      throw new Error(`unerwarteter Aufruf ${url}`);
    }),
  );
}

/** Deal, dann "Stehen bleiben" mit einer frei wählbaren Abrechnung — steuert Push/Gewinn/Verlust gezielt. */
function mockDealThenStand(settlement: { netMinor: number; returnMinor: number; outcomeKey: string; outcomeLabel: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      if (url.toString().endsWith("/api/rounds/interactive-start")) {
        return json({
          status: "open",
          roundId: "r-bj-sound-test",
          gameModeId: "g-classic-blackjack",
          stakeMinor: STAKE,
          maxReturnMinor: STAKE * 5,
          betKey: null,
          usedFreeSpin: false,
          nextSeq: 1,
          state: openState,
          wallet: { demoBalanceMinor: 99_900, bonusBalanceMinor: 0, freeSpins: 0 },
        });
      }
      if (url.toString().endsWith("/actions") && body.action === "stand") {
        return json({
          status: "settled",
          roundId: "r-bj-sound-test",
          nextSeq: 2,
          stakeMinor: STAKE,
          returnMinor: settlement.returnMinor,
          netMinor: settlement.netMinor,
          outcomeKey: settlement.outcomeKey,
          outcomeLabel: settlement.outcomeLabel,
          seed: 1,
          state: { ...openState, phase: "done", dealer: [...openState.dealer, { rank: "K", suit: "diamonds" }] },
          wallet: { demoBalanceMinor: 99_900 + settlement.returnMinor, bonusBalanceMinor: 0, freeSpins: 0 },
          detail: { hands: [settlement.outcomeKey] },
        });
      }
      throw new Error(`unerwarteter Aufruf ${url}`);
    }),
  );
}

describe("BlackjackGame — Klang", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    played.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("spielt 'card' beim Austeilen und 'click' bei einer Spieleraktion", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockDeal();
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    await tick(0);

    expect(played).toContain("card");

    played.length = 0;
    await user.click(screen.getByRole("button", { name: "Stehen bleiben" }));
    expect(played).toContain("click");
  });

  it("spielt bei einem Push (netMinor genau 0, Einsatz zurück) 'settle' und niemals 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockDealThenStand({ netMinor: 0, returnMinor: STAKE, outcomeKey: "push", outcomeLabel: "Push, Einsatz zurück" });
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    await tick(0);
    played.length = 0; // nur den Rundenabschluss beobachten
    await user.click(screen.getByRole("button", { name: "Stehen bleiben" }));
    await tick(1500);

    expect(played).toContain("settle");
    expect(played).not.toContain("win");
  });

  it("spielt bei echtem Netto-Gewinn 'win'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockDealThenStand({ netMinor: 100, returnMinor: 200, outcomeKey: "win", outcomeLabel: "gewonnen" });
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    await tick(0);
    played.length = 0;
    await user.click(screen.getByRole("button", { name: "Stehen bleiben" }));
    await tick(1500);

    expect(played).toContain("win");
    expect(played).not.toContain("settle");
  });

  it("spielt 'error', wenn eine Aktion mangels Deckung abgelehnt wird", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.toString().endsWith("/api/rounds/interactive-start")) {
          return json({
            status: "open",
            roundId: "r-bj-sound-test",
            gameModeId: "g-classic-blackjack",
            stakeMinor: STAKE,
            maxReturnMinor: STAKE * 5,
            betKey: null,
            usedFreeSpin: false,
            nextSeq: 1,
            state: openState,
            wallet: { demoBalanceMinor: 50, bonusBalanceMinor: 0, freeSpins: 0 }, // reicht nicht für Verdoppeln
          });
        }
        // Jede weitere Aktion (hier: Verdoppeln) wird mangels Deckung abgelehnt.
        return new Response(JSON.stringify({ success: false, error: "INSUFFICIENT_FUNDS" }), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    await tick(0);
    played.length = 0;
    await user.click(screen.getByRole("button", { name: "Verdoppeln" }));
    await tick(0);

    expect(played).toContain("error");
  });
});
