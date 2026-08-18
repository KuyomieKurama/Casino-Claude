import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AdminUserListItem } from "@/types/admin";
import { installDialogPolyfill } from "@/test/dialog-polyfill";

installDialogPolyfill();

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const toastMock = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { UsersTable } from "./UsersTable";

function item(overrides: Partial<AdminUserListItem> = {}): AdminUserListItem {
  return {
    id: "u1",
    name: "Testnutzer",
    email: "test@example.com",
    role: "user",
    status: "active",
    isGuest: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    roundCount: 3,
    rg: null,
    ...overrides,
  };
}

/**
 * Diese Komponente rendert wie TransactionList.tsx zwei parallele Ansichten (Mobil-Karten +
 * Desktop-Tabelle, nur per CSS ein-/ausgeblendet) — jsdom wertet keine Media Queries aus, beide
 * stecken im DOM. Zeilen-Buttons kommen deshalb doppelt vor; `getAllByRole(...)[0]` trifft
 * zuverlässig die erste (Mobil-)Instanz. Der Bestätigungsdialog selbst wird nur EINMAL gerendert.
 */
function firstRowButton(name: RegExp) {
  return screen.getAllByRole("button", { name })[0]!;
}

function dialogConfirmButton(name: string) {
  return within(screen.getByRole("dialog")).getByRole("button", { name });
}

describe("UsersTable", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    toastMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  test("zeigt die Admin-Rolle nur als Text, kein Eingabefeld für die Rolle", () => {
    render(<UsersTable items={[item({ role: "admin", id: "admin-1" })]} currentAdminId="someone-else" page={1} pageCount={1} total={1} />);

    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox", { name: /rolle/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nicht vergebbar oder entziehbar/i)).toBeInTheDocument();
  });

  test("ein Admin kann sich in der eigenen Zeile nicht sperren — kein Sperren-Button, stattdessen ein Hinweis", () => {
    render(<UsersTable items={[item({ id: "admin-1", role: "admin" })]} currentAdminId="admin-1" page={1} pageCount={1} total={1} />);

    expect(screen.getAllByText(/kann sich nicht selbst sperren/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /^sperren$/i })).toHaveLength(0);
  });

  test("Sperren erfordert eine Bestätigung, bevor die Anfrage gesendet wird", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { user: { status: "disabled" } } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersTable items={[item()]} currentAdminId="admin-1" page={1} pageCount={1} total={1} />);

    fireEvent.click(firstRowButton(/^sperren$/i));
    expect(fetchMock).not.toHaveBeenCalled(); // noch keine Anfrage vor der Bestätigung

    fireEvent.click(dialogConfirmButton("Sperren"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/u1/status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ status: "disabled" }) }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("ein Fehler vom Server wird verständlich angezeigt, ohne Stacktrace", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: "SELF_LOCK_FORBIDDEN" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersTable items={[item({ id: "member-2" })]} currentAdminId="admin-1" page={1} pageCount={1} total={1} />);

    fireEvent.click(firstRowButton(/^sperren$/i));
    fireEvent.click(dialogConfirmButton("Sperren"));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const call = toastMock.mock.calls[0]![0] as { description: string };
    expect(call.description).toContain("nicht selbst sperren");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("Sitzungen widerrufen sendet eine Anfrage an den Sessions-Endpunkt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { revokedCount: 2 } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersTable items={[item()]} currentAdminId="admin-1" page={1} pageCount={1} total={1} />);

    fireEvent.click(firstRowButton(/sitzungen widerrufen/i));
    fireEvent.click(dialogConfirmButton("Sitzungen widerrufen"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u1/sessions", expect.objectContaining({ method: "POST" })));
  });

  test("zeigt die RG-Kurzfassung lesend an", () => {
    render(<UsersTable items={[item({ rg: { selfExcluded: true, sessionLimitMinutes: null, pausedUntil: null } })]} currentAdminId="admin-1" page={1} pageCount={1} total={1} />);
    expect(screen.getAllByText(/Selbstsperre aktiv/).length).toBeGreaterThan(0);
  });
});
