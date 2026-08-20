import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { HeroObject } from "./HeroObject";

describe("HeroObject — dekoratives 3D-Objekt der Hero-Sektion", () => {
  test("ist aria-hidden und dadurch für Screenreader nicht Teil des Zugänglichkeitsbaums", () => {
    render(<HeroObject />);
    const root = screen.getByTestId("hero-object");
    expect(root).toHaveAttribute("aria-hidden", "true");
  });

  test("trägt keine eigene Information — kein Text im Teilbaum", () => {
    const { container } = render(<HeroObject />);
    expect(container.textContent).toBe("");
  });

  test("rendert ein SVG als visuelles Objekt", () => {
    const { container } = render(<HeroObject />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  test("enthält keine goldene Flächen-Klasse (bg-gold bleibt der einen CTA-Fläche im Hero vorbehalten)", () => {
    const { container } = render(<HeroObject />);
    expect(container.querySelectorAll(".bg-gold").length).toBe(0);
  });
});
