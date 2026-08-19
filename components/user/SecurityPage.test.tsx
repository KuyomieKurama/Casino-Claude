import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SecurityPage } from "./SecurityPage";

/**
 * Auftrag „Ehrlichkeit der Oberfläche": Die Seite zeigte bisher ein Passwort-Formular, das jede
 * Eingabe nur prüfte und sofort verwarf ("Passwortwechsel simuliert.") — ein Formular, das nichts
 * bewirkt. Diese Tests belegen den Ersatz: kein Formular, kein Passwortfeld, stattdessen ein
 * erklärender Hinweis. Die Mock-Geräte-/Login-Listen bleiben, weil sie nichts vortäuschen, das
 * nicht da ist (klar als "Mock" markiert) — dafür gibt es keinen eigenen Test-Fokus hier.
 */
describe("SecurityPage", () => {
  it("zeigt die Überschriftenfolge ohne Sprünge (h1 → h2)", () => {
    render(<SecurityPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Sicherheit" })).toBeInTheDocument();
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(4);
  });

  it("enthält kein Passwort-Formular und kein Passwortfeld mehr", () => {
    const { container } = render(<SecurityPage />);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Passwort ändern/i })).not.toBeInTheDocument();
  });

  it("kennzeichnet Passwortänderung und 2FA ehrlich als nicht möglich, mit Begründung", () => {
    render(<SecurityPage />);
    const badges = screen.getAllByText("Nicht möglich");
    expect(badges).toHaveLength(2);
    expect(screen.getByText(/keinen Endpunkt, der ein neues Passwort entgegennimmt/i)).toBeInTheDocument();
    expect(screen.getByText(/2FA benötigt einen Dienst, der Codes ausstellt und prüft/i)).toBeInTheDocument();
  });

  it("kennzeichnet Geräte und Login-Historie als Beispieldaten (Mock)", () => {
    render(<SecurityPage />);
    expect(screen.getAllByText("Mock").length).toBeGreaterThanOrEqual(2);
  });

  it("verwendet keine goldene Fläche — Gold gehört dem Spiel, nicht der Kontoverwaltung", () => {
    const { container } = render(<SecurityPage />);
    expect(container.querySelectorAll(".bg-gold, [class*=\"bg-gold\"]").length).toBe(0);
  });
});
