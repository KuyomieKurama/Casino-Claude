import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const resolveSystemStatusMock = vi.fn();
const systemStatusPanelMock = vi.fn((props: unknown) => {
  void props;
  return <div>SystemStatusPanel-Platzhalter</div>;
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
  usePathname: () => "/admin",
}));
// server/db/client.ts importiert "server-only" — ein echter Import würde in Vitest immer werfen
// (dieselbe Begründung wie app/(user)/wallet/page.test.tsx). Der eigentliche Lesevorgang läuft
// über resolveSystemStatus, das unten separat gemockt wird — `db` selbst wird hier nie benutzt.
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/admin/system-status", () => ({ resolveSystemStatus: (...args: unknown[]) => resolveSystemStatusMock(...args) }));
vi.mock("@/components/admin/SystemStatusPanel", () => ({ SystemStatusPanel: (props: unknown) => systemStatusPanelMock(props) }));

import AdminPage from "./page";

describe("AdminPage (app/admin/page.tsx)", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    redirectMock.mockClear();
    resolveSystemStatusMock.mockReset();
    systemStatusPanelMock.mockClear();
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
    expect(redirectMock).not.toHaveBeenCalled();
    expect(resolveSystemStatusMock).not.toHaveBeenCalled(); // kein Datenbankzugriff ohne Berechtigung
  });

  it("zeigt das Dashboard mit echtem Systemstatus für aktive Admins (keine Beispieldaten mehr)", async () => {
    requireAdminMock.mockResolvedValueOnce({
      user: { id: "u1", email: "admin@example.com", name: "Admin", role: "admin", status: "active", isGuest: false },
      sessionId: "s1",
      expiresAt: new Date(),
    });
    const snapshot = { driver: { name: "PostgreSQL" } };
    resolveSystemStatusMock.mockResolvedValueOnce(snapshot);

    const element = await AdminPage();
    render(element);

    expect(screen.getByRole("heading", { level: 1, name: /Admin-Dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText(/Kein Zugriff/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Beispieldaten/i)).not.toBeInTheDocument();
    expect(resolveSystemStatusMock).toHaveBeenCalledWith({});
    expect(systemStatusPanelMock).toHaveBeenCalledWith({ snapshot });
  });

  it("wirft einen unerwarteten Fehler unverändert weiter (kein stiller Fallback)", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("Datenbank nicht erreichbar"));
    await expect(AdminPage()).rejects.toThrow("Datenbank nicht erreichbar");
  });
});
