import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BottomNavigation } from "./BottomNavigation";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => usePathnameMock() }));

describe("BottomNavigation — aktiver Bereich", () => {
  test("markiert den aktiven Eintrag über aria-current und ein zusätzliches, nicht-farbliches Merkmal", () => {
    usePathnameMock.mockReturnValue("/casino");
    render(<BottomNavigation />);

    const active = screen.getByRole("link", { name: "Casino" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.querySelector('[aria-hidden="true"]')).not.toBeNull();

    const inactive = screen.getByRole("link", { name: "Wallet" });
    expect(inactive).not.toHaveAttribute("aria-current");
  });

  test("markiert 'Home' nur bei exaktem Pfad als aktiv, nicht bei jeder Unterseite", () => {
    usePathnameMock.mockReturnValue("/casino");
    render(<BottomNavigation />);
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  test("jedes Ziel ist als eigenständiger, benannter Link erreichbar (Touch-Ziel-Fläche über h-full/min-h-11 in der Komponente)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<BottomNavigation />);
    for (const name of ["Home", "Casino", "Favoriten", "Wallet", "Profil"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  test("ist als Navigation mit zugänglichem Namen ausgezeichnet", () => {
    usePathnameMock.mockReturnValue("/");
    render(<BottomNavigation />);
    expect(screen.getByRole("navigation", { name: "Schnellnavigation" })).toBeInTheDocument();
  });
});
