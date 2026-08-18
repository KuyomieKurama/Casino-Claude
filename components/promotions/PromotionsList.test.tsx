import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import { PromotionsList } from "./PromotionsList";

function renderList() {
  return render(
    <AppProviders>
      <PromotionsList />
    </AppProviders>,
  );
}

describe("PromotionsList", () => {
  it("zeigt alle Beispiel-Promotions als eigenständige Karten (h2 je Karte)", () => {
    renderList();
    expect(screen.getByRole("heading", { level: 2, name: "Demo-Willkommensbonus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Weekend Challenge" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "VIP-Lounge" })).toBeInTheDocument();
  });

  it("bietet eine Aktivierung nur für aktive Promotions mit Belohnung an", () => {
    renderList();
    expect(screen.getAllByRole("button", { name: "Demo aktivieren" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Nur Ansicht" })).toBeDisabled();
  });

  it("verwendet höchstens eine goldene Fläche (Kartenraster ohne primäre Buttons)", () => {
    const { container } = renderList();
    expect(container.querySelectorAll(".bg-gold").length).toBeLessThanOrEqual(1);
  });
});
