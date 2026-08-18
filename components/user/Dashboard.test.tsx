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
    expect(screen.getByText("Demo-Guthaben")).toBeInTheDocument();
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

  it("verwendet höchstens eine goldene Fläche pro Bildschirm", () => {
    const { container } = renderDashboard();
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBeLessThanOrEqual(1);
  });
});
