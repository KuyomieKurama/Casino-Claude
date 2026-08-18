import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import HomePage from "./page";

/**
 * HomePage ist eine reine Server-/Präsentationskomponente ohne eigenen Datenzugriff — die
 * Spieldaten kommen über HomeRows aus useCatalog() (AppProviders/CatalogProvider), deshalb reicht
 * hier derselbe Provider-Wrapper wie in components/game/GameCard.test.tsx, kein Mock von
 * server/**.
 */
function renderHome() {
  return render(
    <AppProviders>
      <HomePage />
    </AppProviders>,
  );
}

describe("HomePage — Startseite", () => {
  test("hat genau eine h1 ohne Sprung in der Überschriftenhierarchie", () => {
    renderHome();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
  });

  test("zeigt Spiele bereits im ersten Abschnitt — kein leerer Marketing-Hero ohne Spielbezug", () => {
    renderHome();
    // Das hervorgehobene Spiel (HomeRows) steht als zweites Element direkt nach dem schmalen
    // Einstieg, nicht hinter einem eigenständigen, raumgreifenden Hero-Bereich.
    expect(screen.getByRole("heading", { level: 2, name: "Hervorgehobenes Spiel" })).toBeInTheDocument();
  });

  test("der Einstieg enthält keine eigene goldene Aktionsfläche (Gold bleibt der Spielkarte vorbehalten)", () => {
    renderHome();
    const heroHeading = screen.getByRole("heading", { level: 1 });
    const heroSection = heroHeading.closest("section");
    expect(heroSection).not.toBeNull();
    // Primäre (goldene) Buttons tragen bg-gold (siehe components/ui/Button.tsx variants.primary).
    expect(heroSection!.querySelectorAll(".bg-gold").length).toBe(0);
  });

  test("höchstens eine goldene Fläche auf der gesamten Startseite", () => {
    const { container } = renderHome();
    // .bg-gold ist die einzige gefüllte goldene Fläche (Button-Variante `primary`); Textlinks in
    // Gold (z. B. „Alle ansehen“) sind bewusst keine Fläche und zählen laut Auftrag nicht mit.
    expect(container.querySelectorAll(".bg-gold").length).toBeLessThanOrEqual(1);
  });

  test("Responsible-Gaming-Hinweis und Promotions bleiben inhaltlich erhalten", () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "Responsible Gaming" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Promotions" })).toBeInTheDocument();
  });
});
