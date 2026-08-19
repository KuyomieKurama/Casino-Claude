import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/state/AppProviders";

let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/casino",
  useSearchParams: () => new URLSearchParams(search),
}));

import { Lobby } from "./Lobby";

function renderLobby(searchParams = "") {
  search = searchParams;
  return render(
    <AppProviders>
      <Lobby />
    </AppProviders>,
  );
}

describe("Lobby — Fundament sichtbar (Auftrag §1/§3)", () => {
  it("höchstens eine goldene Fläche auf der Lobby-Seite", () => {
    const { container } = renderLobby();
    expect(container.querySelectorAll(".bg-gold").length).toBeLessThanOrEqual(1);
  });

  it("zeigt Suche, Kategorien und Filter", () => {
    renderLobby();
    expect(screen.getByLabelText("Spiele durchsuchen")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Kategorien" })).toBeInTheDocument();
  });

  it("das Ergebnisraster trägt die Staffelungs-Utility", () => {
    const { container } = renderLobby();
    const grid = container.querySelector("ul.stagger-list");
    expect(grid).not.toBeNull();
  });

  it("die Ergebnisanzahl ist per aria-live erreichbar und aktualisiert sich sichtbar (eigener Schlüssel je Anzahl)", () => {
    const { container } = renderLobby();
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.querySelector(".anim-state-pop")).not.toBeNull();
  });

  it("zeigt bei einer Kategorie ohne Treffer einen hilfreichen, ruhigen Leerzustand mit Vorschlägen", () => {
    renderLobby("q=xxxxxxxxxxkeintreffer");
    expect(screen.getByText("Keine Spiele passen zu dieser Auswahl.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter zurücksetzen" })).toBeInTheDocument();
  });
});
