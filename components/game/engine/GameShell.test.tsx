import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { findGameById } from "@/data/games";
import type { LastRoundResult } from "./useRound";
import { GameShell, type GameShellProps } from "./GameShell";

const game = findGameById("g-european-roulette")!;
const noop = () => {};

const winResult: LastRoundResult = {
  roundId: "rd_win000001",
  outcomeKey: "win",
  outcomeLabel: "Gewinn",
  stakeMinor: 100,
  returnMinor: 300,
  netMinor: 200,
  seed: 11,
  usedFreeSpin: false,
};

/** Rückgabe unter Einsatz — der Fall, den Auftrag Etappe 2 explizit NICHT beschönigt sehen will. */
const lossResult: LastRoundResult = {
  roundId: "rd_loss00001",
  outcomeKey: "lose",
  outcomeLabel: "Verlust",
  stakeMinor: 100,
  returnMinor: 0,
  netMinor: -100,
  seed: 12,
  usedFreeSpin: false,
};

function baseProps(overrides: Partial<GameShellProps> = {}): GameShellProps {
  return {
    game,
    status: "ready",
    hydrated: true,
    children: <div>Spielfläche</div>,
    last: null,
    available: 10000,
    stake: 100,
    onStakeChange: noop,
    onPlay: noop,
    onRetryLoad: noop,
    onTogglePause: noop,
    canStart: true,
    busy: false,
    blocked: false,
    insufficient: false,
    freeSpins: 0,
    useFreeSpin: false,
    onUseFreeSpinChange: noop,
    ...overrides,
  };
}

/** Zählt Elemente mit der exakten Klasse "bg-gold" (nicht "bg-gold-strong"/"hover:bg-gold-strong",
 * die als Substring sonst mitträfen) — die einzige goldene Fläche pro Bildschirm (§4). */
function goldSurfaceCount(container: HTMLElement): number {
  return Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
    (el.getAttribute("class") ?? "").split(/\s+/).includes("bg-gold"),
  ).length;
}

/**
 * Die Ergebniskarte direkt (statt über den Ausgangstext zu suchen): `outcomeLabel` steht bei
 * einem abgeschlossenen Spiel ZWEIMAL im Baum (Ergebniskarte + Reproduzierbarkeits-Fußzeile
 * "Ergebnisklasse „…"") — `getByText` wäre dort mehrdeutig. Die Karte ist eindeutig über
 * aria-live-Region + `.anim-state-pop` erreichbar.
 */
function resultCard(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[aria-live="polite"] .anim-state-pop')!;
}

describe("GameShell — Zustände sind sichtbar unterschieden, nicht allein über Farbe", () => {
  it("'loading': Skeleton mit Ladehinweis, kein Einsatzbereich, kein Startknopf", () => {
    render(<GameShell {...baseProps({ status: "loading" })} />);
    expect(screen.getByText("Spiel wird geladen …")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Runde starten/ })).not.toBeInTheDocument();
  });

  it("'error': eigener Fehlertext mit Wiederholen-Aktion statt Skeleton oder Ergebniszeile", () => {
    render(<GameShell {...baseProps({ status: "error" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Das Spiel konnte nicht geladen werden.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(screen.queryByText("Spiel wird geladen …")).not.toBeInTheDocument();
  });

  it("'ready' (kein Ergebnis): Bereitschaftstext, Startknopf beschriftet und aktivierbar", () => {
    render(<GameShell {...baseProps({ status: "ready" })} />);
    expect(screen.getByText("Bereit. Einsatz wählen und Runde starten.")).toBeInTheDocument();
    const startButton = screen.getByRole("button", { name: "Runde starten" });
    expect(startButton).toBeEnabled();
  });

  it("'playing': eigener Lauftext, Startknopf gesperrt (Sperrzustand) und umbeschriftet", () => {
    render(<GameShell {...baseProps({ status: "playing", canStart: false, busy: true, last: null })} />);
    expect(screen.getByText("Runde läuft …")).toBeInTheDocument();
    const startButton = screen.getByRole("button", { name: "Runde läuft" });
    expect(startButton).toBeDisabled();
    expect(startButton).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Bereit. Einsatz wählen und Runde starten.")).not.toBeInTheDocument();
  });

  it("'paused': eigene Pause-Fläche mit Text, Fortsetzen-Knopf statt Pause-Knopf", () => {
    render(<GameShell {...baseProps({ status: "paused" })} />);
    expect(screen.getByText("Pause")).toBeInTheDocument();
    expect(screen.getByText("Das Guthaben bleibt unverändert.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fortsetzen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  it("'finished': Ergebniskarte mit Ausgang statt Bereitschafts- oder Lauftext", () => {
    const { container } = render(<GameShell {...baseProps({ status: "finished", last: winResult })} />);
    expect(resultCard(container)).toHaveTextContent(/Gewinn/);
    expect(screen.queryByText("Bereit. Einsatz wählen und Runde starten.")).not.toBeInTheDocument();
    expect(screen.queryByText("Runde läuft …")).not.toBeInTheDocument();
  });

  it("höchstens eine goldene Fläche in der Hülle (Startknopf)", () => {
    const { container } = render(<GameShell {...baseProps({ status: "ready" })} />);
    expect(goldSurfaceCount(container)).toBeLessThanOrEqual(1);
  });

  it("der Startknopf trägt Druckfeedback (.press-feedback)", () => {
    render(<GameShell {...baseProps({ status: "ready" })} />);
    const startButton = screen.getByRole("button", { name: "Runde starten" });
    expect(startButton.className).toMatch(/\bpress-feedback\b/);
  });
});

describe("GameShell — Ergebniswechsel wird wahrnehmbar, aber ohne jede Wertung", () => {
  it("eine Rückgabe UNTER dem Einsatz wird nicht positiv hervorgehoben (keine Erfolgsfarbe, kein Sonderschmuck)", () => {
    const { container } = render(<GameShell {...baseProps({ status: "finished", last: lossResult })} />);
    const card = resultCard(container);
    // Zweiter Absatz der Karte ist die Netto-Zeile (formatCreditsSigned mit "−", kein ASCII-"-").
    const netLine = card.querySelectorAll("p")[1]!;
    expect(netLine.textContent).toContain("−1,00");
    expect(netLine.className).not.toMatch(/text-success/);
    // Dieselbe neutrale Übergangsklasse wie bei Gewinn (siehe nächster Test) — kein Sonderfall.
    expect(card.className).toMatch(/\banim-state-pop\b/);
  });

  it("Gewinn und Verlust erhalten exakt dieselbe Übergangsanimation — keine Extra-Betonung für Gewinn", () => {
    const { container, rerender } = render(<GameShell {...baseProps({ status: "finished", last: winResult })} />);
    const winAnimClasses = resultCard(container).className.split(/\s+/).filter((c) => c.startsWith("anim-"));

    rerender(<GameShell {...baseProps({ status: "finished", last: lossResult })} />);
    const lossAnimClasses = resultCard(container).className.split(/\s+/).filter((c) => c.startsWith("anim-"));

    expect(winAnimClasses).toEqual(lossAnimClasses);
    expect(winAnimClasses).toContain("anim-state-pop");
  });

  it("aria-live='polite' an der Ergebniszeile erscheint genau einmal (nicht dupliziert)", () => {
    const { container } = render(<GameShell {...baseProps({ status: "finished", last: winResult })} />);
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });
});
