import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("zeigt ohne glass-Prop weiterhin eine deckende Fläche (bg-surface), keine Glasklasse", () => {
    render(<Card data-testid="card">Inhalt</Card>);
    const card = screen.getByTestId("card");
    expect(card.className).toMatch(/\bbg-surface\b/);
    expect(card.className).not.toMatch(/\bglass-panel\b/);
  });

  it("glass=true ersetzt die deckende Fläche durch .glass-panel, statt eine zusätzliche className zu benötigen", () => {
    render(
      <Card data-testid="card" glass>
        Inhalt
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toMatch(/\bglass-panel\b/);
    expect(card.className).not.toMatch(/\bbg-surface\b/);
  });

  it("kombiniert glass mit einer eigenen className, ohne die Ruheschatten/Kantenlicht-Utility zu verlieren", () => {
    render(
      <Card data-testid="card" glass className="space-y-3">
        Inhalt
      </Card>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toMatch(/\bglass-panel\b/);
    expect(card.className).toMatch(/\bsurface-raised\b/);
    expect(card.className).toMatch(/\bspace-y-3\b/);
  });
});
