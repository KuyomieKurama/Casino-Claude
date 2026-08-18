import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserShell } from "./UserShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/wallet",
}));

describe("UserShell", () => {
  it("rendert die Nutzernavigation und die Kindelemente", () => {
    render(
      <UserShell>
        <p>Seiteninhalt</p>
      </UserShell>,
    );
    expect(screen.getByRole("navigation", { name: "Nutzerbereich" })).toBeInTheDocument();
    expect(screen.getByText("Seiteninhalt")).toBeInTheDocument();
  });

  it("markiert den aktuellen Pfad über aria-current", () => {
    render(
      <UserShell>
        <p>Seiteninhalt</p>
      </UserShell>,
    );
    expect(screen.getByRole("link", { name: "Wallet" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Übersicht" })).not.toHaveAttribute("aria-current");
  });

  it("keine Gating-Logik mehr — es gibt kein Skeleton, keine Weiterleitung, kein aria-busy", () => {
    const { container } = render(
      <UserShell>
        <p>Seiteninhalt</p>
      </UserShell>,
    );
    expect(container.querySelector("[aria-busy]")).toBeNull();
  });

  it("markiert den aktiven Eintrag ohne Gold — Kontoverwaltung bleibt golden-frei (§4)", () => {
    const { container } = render(
      <UserShell>
        <p>Seiteninhalt</p>
      </UserShell>,
    );
    expect(container.querySelectorAll('[class*="bg-gold"], [class*="text-gold"]').length).toBe(0);
  });
});
