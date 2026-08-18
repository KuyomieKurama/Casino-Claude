import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

// vi.mock-Fabriken werden an den Dateianfang gehoben — Klassen, auf die die Fabrik zugreift,
// müssen deshalb über vi.hoisted() entstehen, sonst schlägt der Zugriff mit einem
// Temporal-Dead-Zone-Fehler fehl (die Fabrik liefe vor der eigentlichen class-Deklaration).
const { UnauthenticatedError, UnauthorizedError } = vi.hoisted(() => ({
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/server/auth/guards", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
  UnauthenticatedError,
  UnauthorizedError,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

import AdminPage from "./page";

describe("AdminPage (app/admin/page.tsx)", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    redirectMock.mockClear();
  });

  it("leitet ohne Sitzung nach /login?next=/admin weiter", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(AdminPage()).rejects.toThrow("REDIRECT:/login?next=%2Fadmin");
    expect(redirectMock).toHaveBeenCalledWith("/login?next=%2Fadmin");
  });

  it("zeigt für angemeldete Nutzer ohne Adminrolle 'Kein Zugriff', ohne Redirect und ohne Dashboard-Inhalte", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());
    const element = await AdminPage();
    render(element);

    expect(screen.getByRole("heading", { level: 1, name: /Kein Zugriff/i })).toBeInTheDocument();
    expect(screen.queryByText(/Admin-Dashboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Beispieldaten/i)).not.toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("zeigt das Dashboard für aktive Admins", async () => {
    requireAdminMock.mockResolvedValueOnce({
      user: { id: "u1", email: "admin@example.com", name: "Admin", role: "admin", status: "active", isGuest: false },
      sessionId: "s1",
      expiresAt: new Date(),
    });
    const element = await AdminPage();
    render(element);

    expect(screen.getByRole("heading", { level: 1, name: /Admin-Dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText(/Kein Zugriff/i)).not.toBeInTheDocument();
  });

  it("wirft einen unerwarteten Fehler unverändert weiter (kein stiller Fallback)", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("Datenbank nicht erreichbar"));
    await expect(AdminPage()).rejects.toThrow("Datenbank nicht erreichbar");
  });
});
