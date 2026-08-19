import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { AdminAuditLogEntry } from "@/types/admin";
import { AuditLogTable } from "./AuditLogTable";

function entry(overrides: Partial<AdminAuditLogEntry> = {}): AdminAuditLogEntry {
  return {
    id: "audit_1",
    seq: 1,
    actorUserId: "admin-1",
    action: "user.status.update",
    entityType: "user",
    entityId: "member-1",
    before: { status: "active" },
    after: { status: "disabled" },
    createdAt: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("AuditLogTable", () => {
  test("zeigt Einträge mit Vorher/Nachher-Zustand", () => {
    render(<AuditLogTable entries={[entry()]} total={1} />);
    expect(screen.getAllByText("user.status.update").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/active.*disabled/).length).toBeGreaterThan(0);
  });

  test("ohne Einträge erscheint ein Leerzustand statt einer leeren Tabelle", () => {
    render(<AuditLogTable entries={[]} total={0} />);
    expect(screen.getByText(/noch keine admin-aktionen/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("Blätterung zeigt die Gesamtzahl an (keine unbegrenzte Liste)", () => {
    render(<AuditLogTable entries={[entry()]} total={42} nextHref="/admin/audit-log?cursors=1" />);
    expect(screen.getByText(/von 42 Einträgen/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /nächste seite/i })).toBeInTheDocument();
  });

  test("Tabellen tragen echte Kopfzellen (scope=col)", () => {
    render(<AuditLogTable entries={[entry()]} total={1} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header).toHaveAttribute("scope", "col");
  });

  test("zeigt Informationen dichter als der Nutzerbereich (Admin-Auftrag 'Gestaltung')", () => {
    const { container } = render(<AuditLogTable entries={[entry()]} total={1} />);
    // px-3 py-2 statt der großzügigeren px-4 py-3 aus components/wallet/TransactionList.tsx.
    const cell = container.querySelector("tbody td");
    expect(cell).toHaveClass("px-3", "py-2");
  });
});
