import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { HERO_TEXT } from "@/lib/constants";
import { Hero } from "./Hero";

describe("Hero — stärkstes Element der Startseite", () => {
  test("hat genau eine h1 mit dem bestehenden Hero-Text", () => {
    render(<Hero />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(HERO_TEXT);
  });

  test("der primäre CTA ist als Link mit Namen 'Jetzt spielen' zum Casino erreichbar", () => {
    render(<Hero />);
    const primary = screen.getByRole("link", { name: /Jetzt spielen/ });
    expect(primary).toHaveAttribute("href", "/casino");
  });

  test("der sekundäre CTA ist als Link mit Namen 'Konto erstellen' zur Registrierung erreichbar", () => {
    render(<Hero />);
    const secondary = screen.getByRole("link", { name: /Konto erstellen/ });
    expect(secondary).toHaveAttribute("href", "/register");
  });

  test("das Hero-Objekt ist aria-hidden (rein dekorativ)", () => {
    render(<Hero />);
    const heroObject = screen.getByTestId("hero-object");
    expect(heroObject).toHaveAttribute("aria-hidden", "true");
  });

  test("genau ein goldenes Element — der primäre CTA", () => {
    const { container } = render(<Hero />);
    const goldElements = container.querySelectorAll(".bg-gold");
    expect(goldElements.length).toBe(1);
    expect(goldElements[0]).toHaveTextContent(/Jetzt spielen/);
  });

  test("der sekundäre CTA trägt selbst keine goldene Fläche", () => {
    render(<Hero />);
    const secondary = screen.getByRole("link", { name: /Konto erstellen/ });
    expect(secondary.className).not.toMatch(/\bbg-gold\b/);
  });

  test("Vertrauenselemente nennen nur belegbare Aussagen, keine erfundenen Versprechen", () => {
    render(<Hero />);
    expect(screen.getByText(/10\.000 Credits Startguthaben/)).toBeInTheDocument();
    expect(screen.getByText(/Kein Echtgeldspiel/)).toBeInTheDocument();
    const forbidden = /(lizenz|zertifikat|garantiert|geprüft von|siegel)/i;
    const heroText = document.body.textContent ?? "";
    expect(heroText).not.toMatch(forbidden);
  });
});
