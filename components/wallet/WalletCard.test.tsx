import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import { installDialogPolyfill } from "@/test/dialog-polyfill";
import { WalletCard } from "./WalletCard";

installDialogPolyfill();

function renderWallet() {
  return render(
    <AppProviders>
      <WalletCard />
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
describe("WalletCard", () => {
  it("zeigt die Kernelemente: Guthaben, Bonus-Credits, Freirunden, Aktionen", () => {
    renderWallet();
    expect(screen.getByRole("heading", { level: 2, name: "Guthaben" })).toBeInTheDocument();
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

  it("verwendet auch im geöffneten Zurücksetzen-Dialog keine goldene Fläche", async () => {
    const u = userEvent.setup();
    const { container } = renderWallet();
    await u.click(screen.getByRole("button", { name: "Zurücksetzen" }));
    const dialog = screen.getByRole("dialog");
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBe(0);
    // Der Bestätigungsbutton im Dialog trägt denselben Namen wie der auslösende Button —
    // deshalb hier gezielt innerhalb des Dialogs gesucht statt global.
    expect(within(dialog).getByRole("button", { name: "Zurücksetzen" })).toBeInTheDocument();
  });
});
