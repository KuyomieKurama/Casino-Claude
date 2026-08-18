import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Transaction } from "@/types/transaction";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { HistoryPage } from "./HistoryPage";

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx1",
    seq: 1,
    userId: "u1",
    type: "demo_bet",
    amountMinor: -100,
    balanceAfterMinor: 99_900,
    createdAt: "2026-08-15T10:00:00.000Z",
    isDemo: true,
    ...over,
  };
}

describe("HistoryPage", () => {
  it("Grenzfall: keine Einträge zeigt den Leerzustand statt einer Tabelle, keine Pagination", () => {
    render(<HistoryPage range="all" gameId="" entries={[]} gameOptions={[]} total={0} pageNumber={1} />);

    expect(screen.getByText("Keine Buchungen.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Seitennavigation" })).not.toBeInTheDocument();
  });

  it("Grenzfall: genau eine Seite zeigt keinen 'Nächste Seite'-Link", () => {
    render(<HistoryPage range="all" gameId="" entries={[tx()]} gameOptions={[]} total={1} pageNumber={1} />);

    expect(screen.getByText("1 Buchung insgesamt, Seite 1.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nächste Seite" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nächste Seite" })).toBeDisabled();
  });

  it("Grenzfall: mehrere Seiten zeigen einen aktiven 'Nächste Seite'-Link mit Cursor", () => {
    render(<HistoryPage range="all" gameId="" entries={[tx(), tx({ id: "tx2", seq: 2 })]} gameOptions={[]} total={45} pageNumber={2} prevHref="/history?cursors=45" nextHref="/history?cursors=45,25" />);

    expect(screen.getByText("45 Buchungen insgesamt, Seite 2.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nächste Seite" })).toHaveAttribute("href", "/history?cursors=45,25");
    expect(screen.getByRole("link", { name: "Vorherige Seite" })).toHaveAttribute("href", "/history?cursors=45");
  });

  it("löst gameOptions-IDs über den Katalog in lesbare Namen auf", () => {
    render(<HistoryPage range="all" gameId="" entries={[]} gameOptions={["g-neon-nights"]} total={0} pageNumber={1} />);

    expect(screen.getByRole("option", { name: "Neon Nights" })).toBeInTheDocument();
  });
});
