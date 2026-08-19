import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@/types/user";
import { AppProviders } from "@/state/AppProviders";
import { Dashboard } from "./Dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/auth/authClient", () => ({
  authClient: { signOut: vi.fn().mockResolvedValue(undefined) },
}));

const user: User = { id: "u1", displayName: "Ada Beispiel", email: "ada@example.com", role: "user", isGuest: false };

function renderDashboard() {
  return render(
    <AppProviders user={user}>
      <Dashboard />
    </AppProviders>,
  );
}

describe("Dashboard", () => {
  it("zeigt Begrüßung und die vier Kennzahlen-Karten", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { level: 1, name: /Hallo, Ada Beispiel/ })).toBeInTheDocument();
    expect(screen.getByText("Guthaben")).toBeInTheDocument();
    expect(screen.getByText("Gespielte Runden")).toBeInTheDocument();
    expect(screen.getByText("Favoriten")).toBeInTheDocument();
    expect(screen.getByText("Netto (Rückgabe − Einsatz)")).toBeInTheDocument();
  });

  it("zeigt den Leerzustand der letzten Bewegungen ohne Buchungen", () => {
    renderDashboard();
    expect(screen.getByText("Noch keine Buchungen.")).toBeInTheDocument();
  });

  it("zeigt den Responsible-Gaming-Kurzstatus mit Link zum Bereich", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { level: 2, name: /Responsible Gaming/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Bereich" })).toHaveAttribute("href", "/responsible-gaming");
  });

  it("verwendet keine goldene Fläche — Gold gehört dem Spiel, nicht der Kontoverwaltung", () => {
    const { container } = renderDashboard();
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBe(0);
  });

  it("hebt das Guthaben als wichtigste Kennzahl visuell hervor (klare Hierarchie)", () => {
    renderDashboard();
    const balanceValue = screen.getByText("Guthaben").closest("div")?.parentElement?.querySelector(".tabular");
    expect(balanceValue).toHaveClass("text-2xl");
    const roundsValue = screen.getByText("Gespielte Runden").closest("div")?.parentElement?.querySelector(".tabular");
    expect(roundsValue).toHaveClass("text-xl");
    expect(roundsValue).not.toHaveClass("text-2xl");
  });
});
