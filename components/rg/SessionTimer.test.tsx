import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "@/state/AppProviders";
import { SessionTimer } from "./SessionTimer";

/**
 * Responsible Gaming bleibt ohne Verkaufsästhetik (Auftrag): kein Gold, weder als Fläche noch als
 * Hover-Akzent — anders als im übrigen Nutzerbereich gilt hier keine Ausnahme für geteilte,
 * gesperrte Primitiven (siehe Kommentar in SessionTimer.tsx).
 */
describe("SessionTimer", () => {
  it("compact: verwendet kein Gold, weder im Ruhezustand noch als Hover-Klasse", () => {
    const { container } = render(
      <AppProviders>
        <SessionTimer variant="compact" />
      </AppProviders>,
    );
    expect(container.querySelectorAll('[class*="gold"]').length).toBe(0);
    expect(screen.getByRole("link", { name: /Spielzeit dieser Sitzung/ })).toBeInTheDocument();
  });

  it("full: zeigt die Spielzeit mit Tabellenziffern, ohne Gold", () => {
    const { container } = render(
      <AppProviders>
        <SessionTimer variant="full" />
      </AppProviders>,
    );
    expect(screen.getByText("Aktuelle Spielzeit")).toBeInTheDocument();
    expect(container.querySelectorAll('[class*="gold"]').length).toBe(0);
  });
});
