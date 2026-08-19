import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { games } from "@/data/games";
import { AppProviders } from "@/state/AppProviders";
import { GameGrid } from "./GameGrid";

function renderGrid(count: number) {
  const sample = games.filter((g) => g.status === "active").slice(0, count);
  return render(
    <AppProviders>
      <GameGrid games={sample} />
    </AppProviders>,
  );
}

describe("GameGrid — gestaffelter Eintritt (Auftrag §1/§3)", () => {
  it("trägt die stagger-list-Utility, damit Kacheln nacheinander statt schlagartig eintreten", () => {
    const { container } = renderGrid(4);
    const list = container.querySelector("ul");
    expect(list?.className).toMatch(/\bstagger-list\b/);
  });

  it("jede Kachel bleibt ein eigenständiges Listenelement (Voraussetzung für :nth-child-Staffelung)", () => {
    const { container } = renderGrid(4);
    const items = container.querySelectorAll("ul > li");
    expect(items.length).toBe(4);
  });
});

describe("GameGrid — stabile Abmessungen", () => {
  it("jede Kachel hat ein festes Seitenverhältnis für den Bildbereich (springt bei Hover/Text nicht)", () => {
    const { container } = renderGrid(3);
    const arts = container.querySelectorAll(".aspect-\\[4\\/3\\]");
    expect(arts.length).toBeGreaterThan(0);
  });

  it("Titel und Nebentext sind auf eine Zeile begrenzt (line-clamp), lange Namen sprengen die Kachel nicht", () => {
    const { container } = renderGrid(3);
    expect(container.querySelectorAll(".line-clamp-1").length).toBeGreaterThan(0);
  });
});
