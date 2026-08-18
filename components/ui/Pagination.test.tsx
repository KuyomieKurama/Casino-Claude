import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("rendert Vorherige/Nächste als echte Links, wenn hrefs vorhanden sind (Tastatur- und Screenreader-tauglich)", () => {
    render(<Pagination prevHref="/history?cursor=1" nextHref="/history?cursor=2" summary="Seite 2, 45 Buchungen" />);
    const prev = screen.getByRole("link", { name: "Vorherige Seite" });
    const next = screen.getByRole("link", { name: "Nächste Seite" });
    expect(prev).toHaveAttribute("href", "/history?cursor=1");
    expect(next).toHaveAttribute("href", "/history?cursor=2");
    expect(screen.getByText("Seite 2, 45 Buchungen")).toBeInTheDocument();
  });

  it("deaktiviert Vorherige/Nächste (kein Link, aber sichtbar und für Screenreader erkennbar), wenn kein href übergeben wird", () => {
    render(<Pagination summary="Seite 1, 5 Buchungen" />);
    expect(screen.queryByRole("link", { name: "Vorherige Seite" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nächste Seite" })).not.toBeInTheDocument();
    const prevButton = screen.getByRole("button", { name: "Vorherige Seite" });
    const nextButton = screen.getByRole("button", { name: "Nächste Seite" });
    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeDisabled();
  });

  it("beschriftet die Navigation für Screenreader eindeutig", () => {
    render(<Pagination summary="Seite 1, 5 Buchungen" />);
    expect(screen.getByRole("navigation", { name: "Seitennavigation" })).toBeInTheDocument();
  });
});
