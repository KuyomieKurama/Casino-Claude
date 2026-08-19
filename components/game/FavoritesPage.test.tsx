import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import { FavoritesPage } from "./FavoritesPage";

function renderFavorites() {
  return render(
    <AppProviders>
      <FavoritesPage />
    </AppProviders>,
  );
}

describe("FavoritesPage", () => {
  it("zeigt den Leerzustand mit Empfehlungen, solange keine Favoriten markiert sind", () => {
    renderFavorites();
    expect(screen.getByRole("heading", { level: 1, name: "Favoriten" })).toBeInTheDocument();
    expect(screen.getByText("Noch keine Favoriten.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Spiele entdecken" })).toHaveAttribute("href", "/casino");
  });

  it("verwendet keine goldene Fläche — Gold gehört dem Spiel, nicht der Kontoverwaltung", () => {
    const { container } = renderFavorites();
    expect(container.querySelectorAll('.bg-gold, [class*="bg-gold"]').length).toBe(0);
  });
});
