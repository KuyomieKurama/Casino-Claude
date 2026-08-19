import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import LiveCasinoPage from "./page";

function renderPage() {
  return render(
    <AppProviders>
      <LiveCasinoPage />
    </AppProviders>,
  );
}

describe("LiveCasinoPage", () => {
  it("zeigt Überschrift und kennzeichnet den Dealer-Bereich klar als Illustration", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: /Live-Casino/ })).toBeInTheDocument();
    expect(screen.getByText("Dealer-Bereich (Illustration)")).toBeInTheDocument();
    expect(screen.getByText(/kein Video, keine realen Personen/)).toBeInTheDocument();
  });

  it("verwendet höchstens eine goldene Fläche", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll(".bg-gold").length).toBeLessThanOrEqual(1);
  });
});
