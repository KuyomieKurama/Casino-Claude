import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const resolveAdminGameOverviewMock = vi.fn();
const gamesTableMock = vi.fn((props: unknown) => {
  void props;
  return <div>GamesTable-Platzhalter</div>;
});

const { UnauthenticatedError, UnauthorizedError } = vi.hoisted(() => ({
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
  UnauthenticatedError,
  UnauthorizedError,
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url), usePathname: () => "/admin/games" }));
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/admin/game-admin-read-model", () => ({ resolveAdminGameOverview: (...args: unknown[]) => resolveAdminGameOverviewMock(...args) }));
vi.mock("@/components/admin/GamesTable", () => ({ GamesTable: (props: unknown) => gamesTableMock(props) }));

import Page from "./page";

describe("AdminGamesPage (app/admin/games/page.tsx)", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    redirectMock.mockClear();
    resolveAdminGameOverviewMock.mockReset();
    gamesTableMock.mockClear();
  });

  it("leitet ohne Sitzung nach /login weiter", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(Page()).rejects.toThrow("REDIRECT:/login?next=%2Fadmin%2Fgames");
  });

  it("zeigt 'Kein Zugriff' für Nicht-Admins, ohne den Katalog zu laden", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());
    const element = await Page();
    render(element);

    expect(screen.getByRole("heading", { level: 1, name: /Kein Zugriff/i })).toBeInTheDocument();
    expect(resolveAdminGameOverviewMock).not.toHaveBeenCalled();
  });

  it("lädt den Katalog und reicht ihn an GamesTable weiter", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "admin-1", email: "a@example.com", name: "Admin", role: "admin", status: "active", isGuest: false }, sessionId: "s1", expiresAt: new Date() });
    const games = [{ id: "g1" }];
    resolveAdminGameOverviewMock.mockResolvedValueOnce(games);

    const element = await Page();
    render(element);

    expect(screen.getByRole("heading", { level: 1, name: /Spielverwaltung/i })).toBeInTheDocument();
    expect(gamesTableMock).toHaveBeenCalledWith({ items: games });
  });
});
