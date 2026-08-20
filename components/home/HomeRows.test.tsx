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
  test("rendert das hervorgehobene Spiel mit eigener, sichtbarer Überschrift", () => {
    renderHomeRows();
    // Anders als zuvor (sr-only) ist die Überschrift jetzt sichtbar (Auftrag §6, klare
    // Sektionshierarchie wie bei den übrigen Reihen).
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
    expect(root?.className).toMatch(/space-y-2xl/);
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

  test("keine goldene Fläche in HomeRows — die eine goldene Fläche der Startseite gehört seit der Hero-Revision dem Hero-CTA", () => {
    const { container } = renderHomeRows();
    // Die hervorgehobene Karte trägt restrainedCta (siehe Kommentar in HomeRows.tsx und
    // components/game/GameCard.tsx) und zeigt deshalb einen Umriss- statt eines goldenen Buttons.
    expect(container.querySelectorAll(".bg-gold").length).toBe(0);
  });
});
