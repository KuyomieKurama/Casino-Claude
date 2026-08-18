import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const resolveAdminUsersPageMock = vi.fn();
const usersTableMock = vi.fn((props: unknown) => {
  void props;
  return <div>UsersTable-Platzhalter</div>;
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
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url), usePathname: () => "/admin/users" }));
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/admin/user-admin-read-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/user-admin-read-model")>();
  return { ...actual, resolveAdminUsersPage: (...args: unknown[]) => resolveAdminUsersPageMock(...args) };
});
vi.mock("@/components/admin/UsersTable", () => ({ UsersTable: (props: unknown) => usersTableMock(props) }));

import Page from "./page";

function searchParams(params: Record<string, string> = {}) {
  return Promise.resolve(params);
}

describe("AdminUsersPage (app/admin/users/page.tsx)", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    redirectMock.mockClear();
    resolveAdminUsersPageMock.mockReset();
    usersTableMock.mockClear();
  });

  it("leitet ohne Sitzung nach /login weiter", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(Page({ searchParams: searchParams() })).rejects.toThrow("REDIRECT:/login?next=%2Fadmin%2Fusers");
  });

  it("zeigt 'Kein Zugriff' für Nicht-Admins, ohne die Nutzerliste zu laden", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());
    const element = await Page({ searchParams: searchParams() });
    render(element);

    expect(screen.getByRole("heading", { level: 1, name: /Kein Zugriff/i })).toBeInTheDocument();
    expect(resolveAdminUsersPageMock).not.toHaveBeenCalled();
  });

  it("liest die Seitenzahl aus der URL und reicht die Daten an UsersTable weiter", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "admin-1", email: "a@example.com", name: "Admin", role: "admin", status: "active", isGuest: false }, sessionId: "s1", expiresAt: new Date() });
    const usersPage = { items: [], total: 0, page: 2, pageCount: 2 };
    resolveAdminUsersPageMock.mockResolvedValueOnce(usersPage);

    const element = await Page({ searchParams: searchParams({ page: "2" }) });
    render(element);

    expect(resolveAdminUsersPageMock).toHaveBeenCalledWith({}, 2);
    expect(usersTableMock).toHaveBeenCalledWith({ items: [], currentAdminId: "admin-1", page: 2, pageCount: 2, total: 0 });
  });
});
