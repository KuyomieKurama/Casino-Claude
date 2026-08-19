import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import { BonusesPage } from "./BonusesPage";

function renderBonuses() {
  return render(
    <AppProviders>
      <BonusesPage />
    </AppProviders>,
  );
}

describe("BonusesPage", () => {
  it("zeigt die Überschriftenfolge ohne Sprünge (h1 → h2) und die Kernelemente", () => {
    renderBonuses();
    expect(screen.getByRole("heading", { level: 1, name: "Boni" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Aktivierte Promotions" })).toBeInTheDocument();
    expect(screen.getByText("Bonus-Credits")).toBeInTheDocument();
    expect(screen.getByText("Freirunden")).toBeInTheDocument();
  });

  it("weist ehrlich darauf hin, dass Aktivierungen nur lokal wirken und ein Neuladen sie zurücksetzt", () => {
    renderBonuses();
    expect(screen.getByText(/wirkt sofort in diesem Tab, aber nur dort/i)).toBeInTheDocument();
    expect(screen.getByText(/noch keinen Server-Endpunkt gibt/i)).toBeInTheDocument();
  });

  it("zeigt einen Leerzustand mit nächstem Schritt, wenn noch keine Promotion aktiviert wurde", () => {
    renderBonuses();
    expect(screen.getByText("Noch keine Promotion aktiviert.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zu den Promotions" })).toHaveAttribute("href", "/promotions");
  });

  it("verwendet keine goldene Fläche — Gold gehört dem Spiel, nicht der Kontoverwaltung", () => {
    const { container } = renderBonuses();
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBe(0);
  });
});
