import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_CRITERIA } from "@/lib/filters";
import { CategoryTabs } from "./CategoryTabs";
import type { UrlCriteria } from "./useLobbyCriteria";

function criteria(overrides: Partial<UrlCriteria> = {}): UrlCriteria {
  const { q, cat, provider, mechanic, difficulty, sort } = DEFAULT_CRITERIA;
  return { q, cat, provider, mechanic, difficulty, sort, ...overrides };
}

describe("CategoryTabs — aktive Kategorie nicht allein über Farbe erkennbar (Auftrag §3)", () => {
  it("markiert die aktive Kategorie zusätzlich mit einem Häkchen-Icon (nicht nur Farbe)", () => {
    const { container } = render(<CategoryTabs criteria={criteria({ cat: "slots" })} />);
    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveTextContent("Slots");
    // lucide-react rendert Icons als <svg>; genau eines steckt im aktiven Reiter.
    expect(activeLink.querySelector("svg")).not.toBeNull();
    // Kein anderer Reiter trägt das Icon.
    const allLinks = container.querySelectorAll("a");
    const linksWithIcon = Array.from(allLinks).filter((a) => a.querySelector("svg"));
    expect(linksWithIcon).toHaveLength(1);
  });

  it("hebt die aktive Kategorie zusätzlich über Schriftstärke hervor (font-semibold)", () => {
    render(<CategoryTabs criteria={criteria({ cat: "slots" })} />);
    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink.innerHTML).toContain("font-semibold");
  });

  it("verwendet keine goldene Fläche (bg-gold bleibt Umriss/Text, Unterkante ist eine Haarlinie)", () => {
    const { container } = render(<CategoryTabs criteria={criteria({ cat: "slots" })} />);
    // Die einzige bg-gold-Instanz ist die 1px-Unterkantenlinie aus Tabs.tsx, keine gefüllte Fläche.
    expect(container.querySelectorAll(".bg-gold").length).toBeLessThanOrEqual(1);
  });

  it("wechselt das Häkchen mit der aktiven Kategorie", () => {
    const { rerender } = render(<CategoryTabs criteria={criteria({ cat: "slots" })} />);
    expect(screen.getByRole("link", { name: /Slots/, current: "page" }).querySelector("svg")).not.toBeNull();

    rerender(<CategoryTabs criteria={criteria({ cat: "roulette" })} />);
    expect(screen.getByRole("link", { name: /Roulette/, current: "page" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Slots" }).querySelector("svg")).toBeNull();
  });
});
