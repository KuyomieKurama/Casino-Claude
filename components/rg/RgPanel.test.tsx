import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import { installDialogPolyfill } from "@/test/dialog-polyfill";
import { RgPanel } from "./RgPanel";

installDialogPolyfill();

function renderPanel() {
  return render(
    <AppProviders>
      <RgPanel />
    </AppProviders>,
  );
}

/**
 * Responsible Gaming ist eine Schutzfunktion und bleibt bewusst ohne Verkaufsästhetik (Auftrag):
 * keine Goldflächen, keine Glow-Effekte. Der Zwei-Schritt-Dialog zum Aktivieren/Aufheben der
 * Selbstsperre bleibt in seiner Schutzwirkung unverändert — dieser Test belegt nur die
 * Bestätigungs-Checkbox-Sperre, nicht die serverseitige Durchsetzung (dafür: state/RgContext.test.tsx).
 */
describe("RgPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("zeigt Status, Pause, Zeitlimit, Selbstsperre und Hilfe als eigene Abschnitte", () => {
    renderPanel();
    expect(screen.getByRole("heading", { level: 2, name: /Aktueller Status/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Session-Pause/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Demo-Zeitlimit pro Sitzung/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Selbstsperre/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Hilfe/ })).toBeInTheDocument();
  });

  it("verwendet keine Goldflächen und keine Gold-Textfarbe im Ruhezustand — reine Schutzfunktion ohne Verkaufsästhetik", () => {
    // Nur Ruhezustand zählt: Der überall geteilte Button (variant="outline") trägt
    // "hover:border-gold hover:text-gold-strong" als Standard-Hoveraffordance jedes
    // Umriss-Buttons im ganzen Produkt (auch im golden-freien Admin-Bereich) — das ist keine
    // sichtbare Goldfläche im Ruhezustand und deshalb bewusst von dieser Prüfung ausgenommen.
    const { container } = renderPanel();
    const restingGoldClasses = Array.from(container.querySelectorAll("*")).flatMap((el) =>
      (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((token) => !token.includes(":") && /(^|-)gold(-strong)?$/.test(token)),
    );
    expect(restingGoldClasses).toEqual([]);
  });

  it("Selbstsperre: die Bestätigung im Zwei-Schritt-Dialog bleibt gesperrt, bis die Checkbox angehakt ist", async () => {
    const u = userEvent.setup();
    renderPanel();
    await u.click(screen.getByRole("button", { name: "Selbstsperre aktivieren" }));
    const dialog = screen.getByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", { name: "Sperre aktivieren" });
    expect(confirmButton).toBeDisabled();
    await u.click(within(dialog).getByRole("checkbox"));
    expect(confirmButton).toBeEnabled();
  });
});
