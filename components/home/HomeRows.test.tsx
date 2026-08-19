import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import { HomeRows } from "./HomeRows";

/** HomeRows liest über useCatalog() (AppProviders/CatalogProvider) aus data/catalog.ts. */
function renderHomeRows() {
  return render(
    <AppProviders>
      <HomeRows />
    </AppProviders>,
  );
}

describe("HomeRows — Startseite zeigt Spiele im Vordergrund", () => {
  test("rendert das hervorgehobene Spiel mit eigener (visuell versteckter) Überschrift", () => {
    renderHomeRows();
    // sr-only-Überschrift wahrt die Überschriftenhierarchie, ohne optisch eine zweite
    // Marketingfläche zu erzeugen.
    expect(screen.getByRole("heading", { level: 2, name: "Hervorgehobenes Spiel" })).toBeInTheDocument();
    // Die featured-Variante von GameCard rendert den Spieltitel als h3.
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);
  });

  test("rendert die Spielreihen mit eigener Überschrift je Reihe", () => {
    renderHomeRows();
    expect(screen.getByRole("heading", { level: 2, name: "Beliebte Spiele" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Neu hinzugefügt" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Slots" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Tischspiele" })).toBeInTheDocument();
  });

  test("jede Reihe ist als benannte Liste (aria-label) erreichbar", () => {
    renderHomeRows();
    expect(screen.getByRole("list", { name: "Beliebte Spiele" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Slots" })).toBeInTheDocument();
  });

  test("die Startseiten-Reihen liegen großzügig getrennt (Abstands-Skala statt Zufallswerte)", () => {
    const { container } = renderHomeRows();
    const root = container.firstElementChild;
    expect(root?.className).toMatch(/space-y-xl/);
  });

  test("Spielreihen treten gestaffelt ein (stagger-list auf dem Wurzelelement)", () => {
    const { container } = renderHomeRows();
    const root = container.firstElementChild;
    expect(root?.className).toMatch(/\bstagger-list\b/);
  });

  test("das hervorgehobene Spiel bekommt eine eigene, ruhige Präsenz-Animation (anim-panel-in) am direkten stagger-list-Kind", () => {
    const { container } = renderHomeRows();
    const featuredSection = screen.getByRole("heading", { level: 2, name: "Hervorgehobenes Spiel" }).closest("section");
    expect(featuredSection?.className).toMatch(/\banim-panel-in\b/);
    // Direktes Kind von stagger-list — sonst würde die generische Regel eine zweite Bewegung
    // erzeugen (siehe Kommentar in HomeRows.tsx und app/globals.css).
    expect(featuredSection?.parentElement).toBe(container.firstElementChild);
  });

  test("höchstens eine goldene Fläche (das hervorgehobene Spiel bleibt Umriss/Text, keine zweite Fläche)", () => {
    const { container } = renderHomeRows();
    expect(container.querySelectorAll(".bg-gold").length).toBeLessThanOrEqual(1);
  });
});
