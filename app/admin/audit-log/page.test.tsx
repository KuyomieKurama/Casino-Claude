import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const resolveAuditLogPageMock = vi.fn();
const auditLogTableMock = vi.fn((props: unknown) => {
  void props;
  return <div>AuditLogTable-Platzhalter</div>;
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
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url), usePathname: () => "/admin/audit-log" }));
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/admin/audit-log-read-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/audit-log-read-model")>();
  return { ...actual, resolveAuditLogPage: (...args: unknown[]) => resolveAuditLogPageMock(...args) };
});
vi.mock("@/components/admin/AuditLogTable", () => ({ AuditLogTable: (props: unknown) => auditLogTableMock(props) }));

import Page from "./page";

function searchParams(params: Record<string, string> = {}) {
  return Promise.resolve(params);
}

describe("AdminAuditLogPage (app/admin/audit-log/page.tsx)", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    redirectMock.mockClear();
    resolveAuditLogPageMock.mockReset();
    auditLogTableMock.mockClear();
  });

  it("leitet ohne Sitzung nach /login weiter", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(Page({ searchParams: searchParams() })).rejects.toThrow("REDIRECT:/login?next=%2Fadmin%2Faudit-log");
  });

  it("zeigt 'Kein Zugriff' für Nicht-Admins, ohne das Audit-Log zu laden", async () => {
    requireAdminMock.mockRejectedValueOnce(new UnauthorizedError());
    const element = await Page({ searchParams: searchParams() });
    render(element);

    expect(screen.getByRole("heading", { level: 1, name: /Kein Zugriff/i })).toBeInTheDocument();
    expect(resolveAuditLogPageMock).not.toHaveBeenCalled();
  });

  it("berechnet nextHref, wenn eine weitere Seite existiert", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "admin-1", email: "a@example.com", name: "Admin", role: "admin", status: "active", isGuest: false }, sessionId: "s1", expiresAt: new Date() });
    resolveAuditLogPageMock.mockResolvedValueOnce({ entries: [{ id: "e1", seq: 10, actorUserId: "admin-1", action: "x", entityType: "user", entityId: "u1", before: null, after: null, createdAt: "2026-01-01T00:00:00.000Z" }], hasMore: true, total: 5 });

    const element = await Page({ searchParams: searchParams() });
    render(element);

    expect(resolveAuditLogPageMock).toHaveBeenCalledWith({}, undefined);
    expect(auditLogTableMock).toHaveBeenCalledWith(expect.objectContaining({ nextHref: "/admin/audit-log?cursors=10" }));
  });

  it("berechnet prevHref aus der Cursor-Kette in der URL", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "admin-1", email: "a@example.com", name: "Admin", role: "admin", status: "active", isGuest: false }, sessionId: "s1", expiresAt: new Date() });
    resolveAuditLogPageMock.mockResolvedValueOnce({ entries: [], hasMore: false, total: 5 });

    const element = await Page({ searchParams: searchParams({ cursors: "20,10" }) });
    render(element);

    expect(resolveAuditLogPageMock).toHaveBeenCalledWith({}, 10);
    expect(auditLogTableMock).toHaveBeenCalledWith(expect.objectContaining({ prevHref: "/admin/audit-log?cursors=20" }));
  });
});
