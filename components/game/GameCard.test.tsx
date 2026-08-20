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

describe("GameCard — Druckfeedback und 3D-Neigung (Auftrag Etappe 3 §1)", () => {
  it.each(["default", "compact", "featured"] as const)(
    "Variante %s trägt press-feedback zusätzlich zur 3D-Kipp-Utility (tilt-card)",
    (variant) => {
      const { container } = renderCard(<GameCard game={base} variant={variant} />);
      const article = container.querySelector("article");
      expect(article?.className).toMatch(/\bpress-feedback\b/);
      expect(article?.className).toMatch(/\btilt-card\b/);
    },
  );

  it("die featured-Variante trägt keine eigene Eintrittsanimation (die kommt vom Seiten-Wrapper, sonst würde sich die Bewegung verdoppeln)", () => {
    const { container } = renderCard(<GameCard game={base} variant="featured" />);
    const article = container.querySelector("article");
    expect(article?.className).not.toMatch(/\banim-panel-in\b/);
  });
});

describe("GameCard — restrainedCta hält den featured-CTA golden-frei (Gold bleibt knapp)", () => {
  it("ohne restrainedCta bleibt der Primär-CTA der featured-Variante golden (Default, bestehende Verwendungen unverändert)", () => {
    const { container } = renderCard(<GameCard game={base} variant="featured" />);
    expect(container.querySelectorAll(".bg-gold").length).toBe(1);
  });

  it("mit restrainedCta zeigt der featured-CTA keine goldene Fläche mehr", () => {
    const { container } = renderCard(<GameCard game={base} variant="featured" restrainedCta />);
    expect(container.querySelectorAll(".bg-gold").length).toBe(0);
  });

  it("restrainedCta wirkt nicht auf default/compact (dort war der CTA nie golden)", () => {
    const { container } = renderCard(<GameCard game={base} variant="default" restrainedCta />);
    expect(container.querySelectorAll(".bg-gold").length).toBe(0);
  });
});

describe("GameCard — stabile Abmessungen (kein Springen bei Hover oder langen Beschriftungen)", () => {
  it("das Bewegungssystem verändert nur transform/box-shadow, nie Breite oder Höhe der Karte", () => {
    const { container } = renderCard(<GameCard game={base} />);
    const article = container.querySelector("article");
    // hover-elevate/press-feedback animieren laut app/globals.css ausschließlich transform und
    // box-shadow — keine der beiden Klassen im Markup deutet auf width/height/top/left hin.
    expect(article?.className).not.toMatch(/\b(w-|h-)\[/);
  });

  it("lange Spielnamen werden auf eine Zeile begrenzt, statt die Kachel zu strecken", () => {
    const longName = { ...base, name: "Ein außergewöhnlich langer Spieltitel, der eigentlich nicht in eine Kachel passt" };
    const { container } = renderCard(<GameCard game={longName} />);
    const heading = container.querySelector("h3");
    expect(heading?.className).toMatch(/line-clamp-1/);
  });
});
