import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { AdminSystemStatusSnapshot } from "@/types/admin";
import { SystemStatusPanel } from "./SystemStatusPanel";

function baseSnapshot(overrides: Partial<AdminSystemStatusSnapshot> = {}): AdminSystemStatusSnapshot {
  return {
    driver: { name: "PostgreSQL", description: "über drizzle-orm/node-postgres (pg-Treiber)" },
    maskedConnection: { host: "db.example.com:5432", database: "velora" },
    serverVersion: { ok: true, data: "PostgreSQL 17.0" },
    migrations: { ok: true, data: { applied: [{ tag: "0000_init", applied: true, appliedAtIso: "2026-01-01T00:00:00.000Z" }], pending: [] } },
    tableRowCounts: { ok: true, data: [{ table: "user", rowCount: 3 }] },
    selectOneLatencyMs: { ok: true, data: 1.2 },
    integrity: { ok: true, data: { checkedWallets: 3, mismatches: [] } },
    rateLimit: { active: false, trustedProxyRangeCount: 0 },
    oauthProviders: [
      { key: "google", displayName: "Google", configured: true },
      { key: "github", displayName: "GitHub", configured: false },
    ],
    ...overrides,
  };
}

describe("SystemStatusPanel", () => {
  test("zeigt die maskierte Verbindung, aber keine Geheimnisse", () => {
    render(<SystemStatusPanel snapshot={baseSnapshot()} />);
    expect(screen.getByText(/db\.example\.com:5432 \/ velora/)).toBeInTheDocument();
  });

  test("hebt eine Integritätsabweichung deutlich hervor", () => {
    const snapshot = baseSnapshot({
      integrity: { ok: true, data: { checkedWallets: 1, mismatches: [{ userId: "u1", walletBalanceMinor: 999_999, ledgerSumMinor: 100_000, differenceMinor: 899_999 }] } },
    });
    render(<SystemStatusPanel snapshot={snapshot} />);

    expect(screen.getByText(/1 Abweichung/)).toBeInTheDocument();
    expect(screen.getByText("u1")).toBeInTheDocument();
    // Statustext, nicht nur Farbe.
    expect(screen.getByRole("columnheader", { name: "Differenz" })).toBeInTheDocument();
  });

  test("zeigt ohne Abweichung eine positive Bestätigung", () => {
    render(<SystemStatusPanel snapshot={baseSnapshot()} />);
    expect(screen.getByText(/keine Abweichung/i)).toBeInTheDocument();
  });

  test("ein fehlgeschlagener Abschnitt zeigt eine verständliche Meldung statt eines Stacktraces", () => {
    const snapshot = baseSnapshot({ serverVersion: { ok: false, error: "Verbindung verweigert" } });
    render(<SystemStatusPanel snapshot={snapshot} />);
    expect(screen.getByText(/Verbindung verweigert/)).toBeInTheDocument();
    expect(screen.queryByText(/at Object/)).not.toBeInTheDocument(); // kein Stacktrace-Fragment
  });

  test("Tabellen tragen echte Kopfzellen (scope=col)", () => {
    render(<SystemStatusPanel snapshot={baseSnapshot()} />);
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(header).toHaveAttribute("scope", "col");
    }
  });

  test("OAuth-Provider-Status zeigt konfiguriert/nicht konfiguriert als Text, nie nur Farbe", () => {
    render(<SystemStatusPanel snapshot={baseSnapshot()} />);
    expect(screen.getByText(/Google: konfiguriert/)).toBeInTheDocument();
    expect(screen.getByText(/GitHub: nicht konfiguriert/)).toBeInTheDocument();
  });
});
