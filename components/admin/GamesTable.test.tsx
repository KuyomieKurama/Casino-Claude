import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AdminGameItem } from "@/types/admin";
import { installDialogPolyfill } from "@/test/dialog-polyfill";

installDialogPolyfill();

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const toastMock = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { GamesTable } from "./GamesTable";

function game(overrides: Partial<AdminGameItem> = {}): AdminGameItem {
  return {
    id: "g1",
    slug: "g1",
    name: "Testspiel",
    status: "active",
    isFeatured: false,
    sortOrder: 0,
    modes: [{ id: "m1", gameId: "g1", label: "Standard", status: "active", sortOrder: 0, engineKey: "slot", paytableKey: "g1" }],
    ...overrides,
  };
}

function dialogConfirmButton(name: RegExp) {
  return within(screen.getByRole("dialog")).getByRole("button", { name });
}

describe("GamesTable", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    toastMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  test("paytable_key, engine_key und RTP werden nur angezeigt, nicht als Eingabefeld", () => {
    render(<GamesTable items={[game()]} />);

    expect(screen.getByText("g1", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText(/RTP wird aus der geprüften Auszahlungstabelle berechnet/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /paytable/i })).not.toBeInTheDocument();
  });

  test("Statuswechsel eines Titels erfordert eine Bestätigung, bevor die Anfrage gesendet wird", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { game: { status: "inactive" } } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GamesTable items={[game()]} />);

    // Zwei "Deaktivieren"-Buttons existieren (Titel- und Modus-Ebene) — der erste ist der
    // Titel-Button (rendert vor der Modus-Tabelle).
    fireEvent.click(screen.getAllByRole("button", { name: "Deaktivieren" })[0]!);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(dialogConfirmButton(/^deaktivieren$/i));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/games/g1/status", expect.objectContaining({ method: "POST", body: JSON.stringify({ status: "inactive" }) })));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test("eine abgelehnte Aktivierung ohne aktiven Modus zeigt eine verständliche Meldung", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: "NO_ACTIVE_MODE" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GamesTable items={[game({ status: "inactive" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Aktivieren" }));
    fireEvent.click(dialogConfirmButton(/^aktivieren$/i));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const call = toastMock.mock.calls[0]![0] as { description: string };
    expect(call.description).toContain("mindestens einen aktiven Modus");
  });

  test("is_featured lässt sich umschalten und löst eine PATCH-Anfrage aus", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { game: { isFeatured: true } } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GamesTable items={[game()]} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /hervorgehoben/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/games/g1/listing", expect.objectContaining({ body: JSON.stringify({ isFeatured: true }) })));
  });

  test("ein Titel ohne Modus zeigt einen Warnhinweis", () => {
    render(<GamesTable items={[game({ modes: [] })]} />);
    expect(screen.getByText(/kann nicht aktiviert werden/i)).toBeInTheDocument();
  });
});
