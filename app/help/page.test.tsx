import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CURRENCY_NOTICE } from "@/lib/constants";
import HelpPage from "./page";

describe("HelpPage", () => {
  it("zeigt Überschrift, FAQ-Einträge und den Responsible-Gaming-Hinweis ohne Sprünge in der Hierarchie", () => {
    render(<HelpPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Hilfe & FAQ" })).toBeInTheDocument();
    expect(screen.getByText("Ist das ein echtes Casino?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Responsible Gaming" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Bereich Responsible Gaming" })).toHaveAttribute("href", "/responsible-gaming");
  });

  it("verwendet höchstens eine goldene Fläche", () => {
    const { container } = render(<HelpPage />);
    expect(container.querySelectorAll(".bg-gold").length).toBeLessThanOrEqual(1);
  });

  it("nennt in den Nutzungsbedingungen den Hinweis auf die Spielwährung ohne Geldwert", () => {
    render(<HelpPage />);
    expect(screen.getByRole("heading", { level: 2, name: "Nutzungsbedingungen" })).toBeInTheDocument();
    expect(screen.getAllByText(CURRENCY_NOTICE).length).toBeGreaterThan(0);
  });
});
