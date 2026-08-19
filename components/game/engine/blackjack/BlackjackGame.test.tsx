import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests } from "@/lib/storage";
import { STORAGE_KEY } from "@/lib/constants";
import { games } from "@/data/games";
import { BlackjackGame } from "./BlackjackGame";
import { applyAction, beginRound, roundSettlement, type BlackjackAction, type RoundState } from "./blackjack-logic";

/**
 * Rauchtest der Oberfläche: interaktive Runde vom Austeilen bis zum Abschluss über useRound in
 * der Server-Betriebsart (Phase 3b). `fetch` wird auf POST /api/rounds/interactive-start und
 * POST /api/rounds/:id/actions gemockt — mit genau der Antwortform, die server/rounds/interactive/
 * blackjack-adapter.ts liefert, berechnet über dieselbe unveränderte Fachlogik
 * (beginRound/applyAction/roundSettlement), die auch der echte Server verwendet.
 * Die Fachregeln selbst prüft blackjack-logic.test.ts.
 */

const game = games.find((g) => g.id === "g-classic-blackjack")!;
const live = games.find((g) => g.id === "g-live-blackjack-demo")!;
const STAKE = 100; // Voreinstellung der Engine, liegt im Einsatzbereich des Spiels
const START_BALANCE_MINOR = 100_000;

/** Erster Seed, dessen Startbild eine spielbare Hand ergibt (kein sofortiger Blackjack). */
const PLAYABLE_SEED = (() => {
  for (let seed = 1; seed < 10_000; seed++) {
    if (beginRound(seed, STAKE).phase === "player") return seed;
  }
  throw new Error("Kein spielbarer Seed gefunden.");
})();

async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function publicView(state: RoundState, finished: boolean) {
  return { dealer: finished ? state.dealer : state.dealer.slice(0, 1), hands: state.hands, activeHand: state.activeHand, phase: state.phase, baseBetMinor: state.baseBetMinor };
}

/** Bildet server/rounds/interactive/blackjack-adapter.ts über fetch() nach — siehe Dateikommentar. */
function mockBlackjackRoutes(seed: number, stakeMinor: number, startBalanceMinor: number) {
  let state: RoundState | null = null;
  let extraStakeMinor = 0;
  let seq = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "content-type": "application/json" } });
      const walletMinor = () => startBalanceMinor - stakeMinor - extraStakeMinor;

      if (url.toString().endsWith("/api/rounds/interactive-start")) {
        state = beginRound(seed, stakeMinor);
        extraStakeMinor = 0;
        seq = 0;
        if (state.phase === "done") {
          const settlement = roundSettlement(state);
          return json({
            status: "settled",
            roundId: "r-bj-test",
            gameModeId: "g-classic-blackjack",
            stakeMinor,
            returnMinor: settlement.returnMinor,
            netMinor: settlement.returnMinor - stakeMinor,
            outcomeKey: settlement.outcomeKey,
            outcomeLabel: settlement.outcomeLabel,
            seed,
            betKey: null,
            usedFreeSpin: false,
            state: publicView(state, true),
            wallet: { balanceMinor: walletMinor() + settlement.returnMinor, bonusBalanceMinor: 0, freeSpins: 0 },
            detail: { hands: settlement.results.map((r) => r.kind) },
          });
        }
        return json({
          status: "open",
          roundId: "r-bj-test",
          gameModeId: "g-classic-blackjack",
          stakeMinor,
          maxReturnMinor: stakeMinor * 5,
          betKey: null,
          usedFreeSpin: false,
          nextSeq: 1,
          state: publicView(state, false),
          wallet: { balanceMinor: walletMinor(), bonusBalanceMinor: 0, freeSpins: 0 },
        });
      }

      if (url.toString().endsWith("/actions") && state) {
        const action = body.action as BlackjackAction;
        seq += 1;
        if (action === "double") extraStakeMinor += state.hands[state.activeHand]!.betMinor;
        if (action === "split") extraStakeMinor += state.baseBetMinor;
        state = applyAction(state, action);
        if (state.phase === "done") {
          const settlement = roundSettlement(state);
          return json({
            status: "settled",
            roundId: "r-bj-test",
            nextSeq: seq + 1,
            stakeMinor: stakeMinor + extraStakeMinor,
            returnMinor: settlement.returnMinor,
            netMinor: settlement.returnMinor - (stakeMinor + extraStakeMinor),
            outcomeKey: settlement.outcomeKey,
            outcomeLabel: settlement.outcomeLabel,
            seed,
            state: publicView(state, true),
            wallet: { balanceMinor: walletMinor() + settlement.returnMinor, bonusBalanceMinor: 0, freeSpins: 0 },
            detail: { hands: settlement.results.map((r) => r.kind) },
          });
        }
        return json({
          status: "open",
          roundId: "r-bj-test",
          nextSeq: seq + 1,
          stakeMinor: stakeMinor + extraStakeMinor,
          state: publicView(state, false),
          wallet: { balanceMinor: walletMinor(), bonusBalanceMinor: 0, freeSpins: 0 },
        });
      }
      throw new Error(`mockBlackjackRoutes: unerwarteter Aufruf ${String(url)}`);
    }),
  );
}

describe("BlackjackGame — Oberfläche und Server-Verdrahtung (Phase 3b)", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("spielt eine Runde durch und bucht genau einmal", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockBlackjackRoutes(PLAYABLE_SEED, STAKE, START_BALANCE_MINOR);
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    await tick(0);
    expect(screen.getByText("Dealer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stehen bleiben" }));
    await tick(1500);
    expect(screen.getAllByText(/Rückgabe/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Karten geben/ })).toBeEnabled();
  });

  it("bucht beim Verdoppeln einen zweiten Einsatz vom Guthaben ab", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockBlackjackRoutes(PLAYABLE_SEED, STAKE, START_BALANCE_MINOR);
    render(
      <AppProviders>
        <BlackjackGame game={game} />
      </AppProviders>,
    );
    await tick(800);
    await user.click(screen.getByRole("button", { name: /Karten geben/ }));
    await tick(0);
    expect(screen.getByText(/Verfügbar: 999,00 Credits/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verdoppeln" }));
    await tick(0);
    // Der Zusatzeinsatz ist im Tisch sofort sichtbar — zustandsseitig, unabhängig davon, ob der
    // Server die Runde durch das Verdoppeln (nur eine Hand, keine weitere Entscheidung mehr
    // offen) bereits im selben Aufruf abgerechnet hat.
    expect(screen.getByText(/Effektiver Gesamteinsatz dieser Runde: 2,00 Credits/)).toBeInTheDocument();
    await tick(1500);
    expect(screen.getByRole("button", { name: /Karten geben/ })).toBeEnabled();
    // Verdoppeln bei nur einer Hand beendet die Runde sofort (keine weitere Entscheidung offen) —
    // Server bucht Zusatzeinsatz und Rückgabe atomar in einer Antwort. Erwarteter Saldo aus
    // derselben unveränderten Fachlogik berechnet, die auch der Server verwendet.
    const doubled = applyAction(beginRound(PLAYABLE_SEED, STAKE), "double");
    const settlement = roundSettlement(doubled);
    const expectedBalanceMinor = START_BALANCE_MINOR - STAKE - STAKE + settlement.returnMinor;
    const expectedText = (expectedBalanceMinor / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(screen.getByText(new RegExp(`Verfügbar: ${expectedText} Credits`))).toBeInTheDocument();
  });

  it("lehnt das Verdoppeln ohne Deckung ab und lässt den Tisch unverändert", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Reicht für den Grundeinsatz, nicht für den Zusatzeinsatz beim Verdoppeln.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
        const state = beginRound(PLAYABLE_SEED, STAKE);
        if (url.toString().endsWith("/api/rounds/interactive-start")) {
          return json({
            success: true,
            data: {
              status: "open",
              roundId: "r-bj-test",
              gameModeId: "g-classic-blackjack",
              stakeMinor: STAKE,
              maxReturnMinor: STAKE * 5,
              betKey: null,
              usedFreeSpin: false,
              nextSeq: 1,
              state: publicView(state, false),
              wallet: { balanceMinor: 50, bonusBalanceMinor: 0, freeSpins: 0 },
            },
          });
        }
        void init;
        return json({ success: false, error: "INSUFFICIENT_FUNDS" });
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
    expect(screen.getByText(/Verfügbar: 0,50 Credits/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verdoppeln" }));
    await tick(0);
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
