import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Game } from "@/types/game";
import { games } from "@/data/games";
import { AppProviders } from "@/state/AppProviders";
import { GameCard } from "./GameCard";

// GameCard bindet FavoriteButton ein, das useCatalog() (aus AppProviders/CatalogProvider)
// voraussetzt.
function renderCard(ui: React.ReactElement) {
  return render(<AppProviders>{ui}</AppProviders>);
}

const base = games.find((g) => g.id === "g-european-roulette")!;

const withSiblings: Game = {
  ...base,
  siblingModes: [
    { id: "g-american-roulette", slug: "american-roulette", label: "Amerikanisch", status: "active", isDefault: false, isLivePresentation: false, minBetMinor: 10, maxBetMinor: 5000 },
    { id: "g-live-roulette-demo", slug: "live-roulette-demo", label: "Live", status: "active", isDefault: false, isLivePresentation: true, minBetMinor: 50, maxBetMinor: 5000 },
  ],
};

describe("GameCard — Geschwisterhinweis (Auftrag §2)", () => {
  it("zeigt bei mehreren Modi den dezenten Hinweis 'Auch als: …'", () => {
    renderCard(<GameCard game={withSiblings} />);
    expect(screen.getByText("Auch als: Amerikanisch, Live")).toBeInTheDocument();
  });

  it("zeigt keinen Hinweis, wenn keine Geschwistermodi bekannt sind", () => {
    renderCard(<GameCard game={base} />);
    expect(screen.queryByText(/Auch als:/)).not.toBeInTheDocument();
  });

  it("zeigt den Hinweis auch in der featured-Variante", () => {
    renderCard(<GameCard game={withSiblings} variant="featured" />);
    expect(screen.getByText("Auch als: Amerikanisch, Live")).toBeInTheDocument();
  });

  it("zeigt den Hinweis auch in der compact-Variante", () => {
    renderCard(<GameCard game={withSiblings} variant="compact" />);
    expect(screen.getByText("Auch als: Amerikanisch, Live")).toBeInTheDocument();
  });
});
