import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import { DemoWallet } from "./DemoWallet";

function renderWallet() {
  return render(
    <AppProviders>
      <DemoWallet />
    </AppProviders>,
  );
}

/**
 * Auftrag „Ehrlichkeit der Oberfläche": Aufstocken/Zurücksetzen wirken bereits vor diesem Auftrag
 * nur lokal (state/WalletContext.tsx: "bleiben rein lokale Übergangsaktionen … dafür gibt es noch
 * keinen Server-Endpunkt") — applyServerWallet() überschreibt den Stand bei jedem Neuladen wieder
 * mit dem Serverwert. Das war bisher nirgends für Nutzer sichtbar. Dieser Test belegt den neuen,
 * sichtbaren Hinweis.
 */
describe("DemoWallet", () => {
  it("zeigt die Kernelemente: Guthaben, Bonus-Credits, Freirunden, Aktionen", () => {
    renderWallet();
    expect(screen.getByRole("heading", { level: 2, name: "Demo-Guthaben" })).toBeInTheDocument();
    expect(screen.getByText("Bonus-Credits")).toBeInTheDocument();
    expect(screen.getByText("Freirunden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zurücksetzen" })).toBeInTheDocument();
  });

  it("weist ehrlich darauf hin, dass Aufstocken/Zurücksetzen nur in diesem Tab wirken", () => {
    renderWallet();
    expect(screen.getByText(/wirkt sofort, aber nur in diesem tab/i)).toBeInTheDocument();
    expect(screen.getByText(/noch keinen Server-Endpunkt gibt/i)).toBeInTheDocument();
  });

  it("verwendet höchstens eine goldene Fläche (die Wallet-Signaturlinie zählt als die eine)", () => {
    const { container } = renderWallet();
    // signature-top ist eine dekorative Haarlinie (box-shadow), keine gefüllte bg-gold-Fläche —
    // die Wallet-Karte ist die im Designsystem vorgesehene Ausnahme für "tragende Flächen".
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBe(0);
  });
});
