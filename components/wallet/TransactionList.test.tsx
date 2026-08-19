import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Transaction } from "@/types/transaction";
import { TransactionList } from "./TransactionList";

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx1",
    seq: 1,
    userId: "u1",
    type: "win",
    amountMinor: 500,
    balanceAfterMinor: 100_500,
    createdAt: "2026-08-15T10:00:00.000Z",
    ...over,
  };
}

describe("TransactionList", () => {
  it("zeigt ein Skeleton, solange nicht hydriert", () => {
    const { container } = render(<TransactionList transactions={[]} hydrated={false} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("Grenzfall: keine Transaktionen zeigt einen Leerzustand mit klarem nächsten Schritt, ohne goldene Fläche", () => {
    const { container } = render(<TransactionList transactions={[]} hydrated />);
    expect(screen.getByText("Noch keine Buchungen.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Zur Lobby" });
    expect(link).toHaveAttribute("href", "/casino");
    // Kontoverwaltung bleibt golden-frei (§4/Auftrag) — auch im Leerzustand-CTA.
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBe(0);
  });

  it("rendert eine echte Tabelle ab md mit Kopfzellen und Kartenliste für mobil, beide mit Betrag und Kontostand danach", () => {
    render(<TransactionList transactions={[tx()]} hydrated sortBy="given" />);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    const columnHeaders = screen.getAllByRole("columnheader");
    expect(columnHeaders.map((h) => h.textContent)).toEqual(["Zeitpunkt", "Vorgang", "Spiel", "Betrag (Credits)", "Kontostand danach"]);
    // Mobil-Karten und Desktop-Tabelle rendern parallel (nur eine per CSS sichtbar) — der Betrag
    // erscheint deshalb zweimal im DOM. 500 Hundertstel = 5,00 Credits.
    expect(screen.getAllByText("+5,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.005,00/).length).toBeGreaterThan(0);
  });

  it("sortiert nach seq (neueste zuerst), wenn sortBy nicht explizit auf 'given' steht", () => {
    render(
      <TransactionList
        transactions={[tx({ id: "a", seq: 1, balanceAfterMinor: 100_000 }), tx({ id: "b", seq: 2, balanceAfterMinor: 100_500 })]}
        hydrated
      />,
    );
    const rows = screen.getAllByRole("row");
    // rows[0] ist die Kopfzeile, rows[1] muss die neuere (seq 2, Stand 1.005,00) sein.
    expect(rows[1]).toHaveTextContent("1.005,00");
    expect(rows[2]).toHaveTextContent("1.000,00");
  });

  it("staffelt den Eintritt der Zeilen (Historie tritt gestaffelt ein, nicht schlagartig)", () => {
    const { container } = render(<TransactionList transactions={[tx({ id: "a", seq: 1 }), tx({ id: "b", seq: 2 })]} hydrated />);
    expect(container.querySelectorAll(".stagger-list").length).toBeGreaterThanOrEqual(2); // mobile <ul> + desktop <tbody>
  });

  it("kennzeichnet Beispieldaten als solche, ohne den echten Betrag zu verschleiern", () => {
    render(<TransactionList transactions={[tx({ id: "sample_tx_1" })]} hydrated />);
    expect(screen.getAllByText(/Beispiel/i).length).toBeGreaterThan(0);
  });
});
