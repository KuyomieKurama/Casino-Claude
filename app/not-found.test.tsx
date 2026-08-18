import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import NotFound from "./not-found";

describe("NotFound (404)", () => {
  it("zeigt genau eine h1 mit Erklärung, Rückweg zur Lobby und Suchfeld", () => {
    render(<NotFound />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Zur Lobby" })).toHaveAttribute("href", "/casino");
    expect(screen.getByRole("searchbox", { name: "Spiel suchen" })).toBeInTheDocument();
  });

  it("verwendet höchstens eine goldene Fläche", () => {
    const { container } = render(<NotFound />);
    expect(container.querySelectorAll(".bg-gold").length).toBeLessThanOrEqual(1);
  });
});
