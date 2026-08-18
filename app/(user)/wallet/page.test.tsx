import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const resolveRecentLedgerEntriesMock = vi.fn();
const walletPageMock = vi.fn((props: unknown) => {
  void props;
  return <div>WalletPage-Platzhalter</div>;
});

// Dieselbe Begründung wie app/game/[slug]/page.test.tsx: server/db/client.ts importiert
// "server-only", ein echter Import würde in Vitest immer werfen.
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/auth/guards", () => ({ getSession: (...args: unknown[]) => getSessionMock(...args) }));
vi.mock("@/server/wallet/ledger-history", () => ({
  resolveRecentLedgerEntries: (...args: unknown[]) => resolveRecentLedgerEntriesMock(...args),
}));
vi.mock("@/components/wallet/WalletPage", () => ({ WalletPage: (props: unknown) => walletPageMock(props) }));

import Page from "./page";

describe("app/(user)/wallet/page.tsx", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    resolveRecentLedgerEntriesMock.mockReset();
    walletPageMock.mockClear();
  });

  it("liest die letzten Bewegungen für die geprüfte Sitzung (nie für eine Angabe aus der Anfrage)", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "u1" } });
    const entries = [{ id: "tx1" }];
    resolveRecentLedgerEntriesMock.mockResolvedValueOnce(entries);

    const element = await Page();
    render(element);

    expect(resolveRecentLedgerEntriesMock).toHaveBeenCalledWith({}, "u1", 10);
    expect(walletPageMock).toHaveBeenCalledWith({ recentEntries: entries });
    expect(screen.getByText("WalletPage-Platzhalter")).toBeInTheDocument();
  });

  it("Gast ohne Sitzung: kein Fehler, userId wird als null übergeben", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    resolveRecentLedgerEntriesMock.mockResolvedValueOnce([]);

    const element = await Page();
    render(element);

    expect(resolveRecentLedgerEntriesMock).toHaveBeenCalledWith({}, null, 10);
    expect(walletPageMock).toHaveBeenCalledWith({ recentEntries: [] });
  });
});
