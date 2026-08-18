import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Transaction } from "@/types/transaction";
import { AppProviders } from "@/state/AppProviders";
import { WalletPage } from "./WalletPage";

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx1",
    seq: 1,
    userId: "u1",
    type: "demo_win",
    amountMinor: 500,
    balanceAfterMinor: 100_500,
    createdAt: "2026-08-15T10:00:00.000Z",
    isDemo: true,
    ...over,
  };
}

/** DemoWallet/TransactionList/useWallet brauchen den Provider-Baum — wie in den bestehenden Engine-Tests. */
const renderWallet = (recentEntries: Transaction[]) =>
  render(
    <AppProviders>
      <WalletPage recentEntries={recentEntries} />
    </AppProviders>,
  );

describe("WalletPage", () => {
  it("zeigt die vom Server übergebenen letzten Bewegungen aus dem Ledger, nicht den lokalen Reducer", () => {
    renderWallet([tx()]);
    // TransactionList rendert Mobil-Karten UND Desktop-Tabelle parallel (nur eine per CSS
    // sichtbar) — "Rückgabe" erscheint deshalb zweimal im DOM, beide Vorkommen sind gültig.
    expect(screen.getAllByText("Rückgabe").length).toBeGreaterThan(0);
  });

  it("zeigt den Leerzustand, wenn der Server keine Bewegungen liefert", () => {
    renderWallet([]);
    expect(screen.getByText("Noch keine Buchungen.")).toBeInTheDocument();
  });

  it("behält den Link zur gesamten Historie", () => {
    renderWallet([]);
    expect(screen.getByRole("link", { name: "Gesamte Historie" })).toHaveAttribute("href", "/history");
  });
});
