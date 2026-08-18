import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const resolveLedgerHistoryPageMock = vi.fn();
const historyPageMock = vi.fn((props: unknown) => {
  void props;
  return <div>HistoryPage-Platzhalter</div>;
});

vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/auth/guards", () => ({ getSession: (...args: unknown[]) => getSessionMock(...args) }));
vi.mock("@/server/wallet/ledger-history", async () => {
  const actual = await vi.importActual<typeof import("@/server/wallet/ledger-history")>("@/server/wallet/ledger-history");
  return { ...actual, resolveLedgerHistoryPage: (...args: unknown[]) => resolveLedgerHistoryPageMock(...args) };
});
vi.mock("@/components/wallet/HistoryPage", () => ({ HistoryPage: (props: unknown) => historyPageMock(props) }));

import Page from "./page";

const emptyPage = { entries: [], hasMore: false, total: 0, gameOptions: [] };

describe("app/(user)/history/page.tsx", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    resolveLedgerHistoryPageMock.mockReset();
    historyPageMock.mockClear();
  });

  it("Gast ohne Sitzung: kein Fehler, userId wird als null übergeben, leere Seite ohne Pagination-Links", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    resolveLedgerHistoryPageMock.mockResolvedValueOnce(emptyPage);

    const element = await Page({ searchParams: Promise.resolve({}) });
    render(element);

    expect(resolveLedgerHistoryPageMock).toHaveBeenCalledWith({}, null, { range: "all" });
    const props = historyPageMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(props.prevHref).toBeUndefined();
    expect(props.nextHref).toBeUndefined();
    expect(props.pageNumber).toBe(1);
    expect(screen.getByText("HistoryPage-Platzhalter")).toBeInTheDocument();
  });

  it("liest Filter aus der URL und reicht sie an den Lesepfad weiter (Autorisierung über die geprüfte userId)", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "u1" } });
    resolveLedgerHistoryPageMock.mockResolvedValueOnce(emptyPage);

    await Page({ searchParams: Promise.resolve({ range: "7d", gameId: "g-neon-nights" }) });

    expect(resolveLedgerHistoryPageMock).toHaveBeenCalledWith({}, "u1", { range: "7d", gameId: "g-neon-nights" });
  });

  it("baut nextHref mit dem Cursor der letzten Zeile, wenn weitere Seiten existieren", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "u1" } });
    resolveLedgerHistoryPageMock.mockResolvedValueOnce({
      entries: [{ seq: 20 }, { seq: 19 }],
      hasMore: true,
      total: 45,
      gameOptions: [],
    });

    render(await Page({ searchParams: Promise.resolve({}) }));

    const props = historyPageMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(props.nextHref).toBe("/history?cursors=19");
    expect(props.prevHref).toBeUndefined();
  });

  it("baut prevHref durch Entfernen des letzten Cursors aus der Kette (Seite 3 → Seite 2)", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "u1" } });
    resolveLedgerHistoryPageMock.mockResolvedValueOnce(emptyPage);

    render(await Page({ searchParams: Promise.resolve({ cursors: "45,25" }) }));

    expect(resolveLedgerHistoryPageMock).toHaveBeenCalledWith({}, "u1", { range: "all", cursor: 25 });
    const props = historyPageMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(props.prevHref).toBe("/history?cursors=45");
    expect(props.pageNumber).toBe(3);
  });

  it("ein ungültiger Zeitraum in der URL führt nicht zum Absturz, sondern zum Default 'all'", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "u1" } });
    resolveLedgerHistoryPageMock.mockResolvedValueOnce(emptyPage);

    await Page({ searchParams: Promise.resolve({ range: "letztes-jahrzehnt" }) });

    expect(resolveLedgerHistoryPageMock).toHaveBeenCalledWith({}, "u1", { range: "all" });
  });
});
