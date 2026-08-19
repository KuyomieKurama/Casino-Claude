import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CRITERIA } from "@/lib/filters";
import { FilterPanel } from "./FilterPanel";
import type { UrlCriteria } from "./useLobbyCriteria";

function criteria(overrides: Partial<UrlCriteria> = {}): UrlCriteria {
  const { q, cat, provider, mechanic, difficulty, sort } = DEFAULT_CRITERIA;
  return { q, cat, provider, mechanic, difficulty, sort, ...overrides };
}

describe("FilterPanel — aktive Filter nicht allein über Farbe erkennbar (Auftrag §3)", () => {
  it("sidebar: zeigt ohne aktive Filter weder Anzahl-Badge noch Zurücksetzen-Button", () => {
    render(<FilterPanel mode="sidebar" criteria={criteria()} onApply={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zurücksetzen" })).not.toBeInTheDocument();
  });

  it("sidebar: zeigt die Anzahl aktiver Filter als Text (Badge) neben der Überschrift", () => {
    render(<FilterPanel mode="sidebar" criteria={criteria({ provider: "velora-studios", mechanic: "bonus" })} onApply={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zurücksetzen" })).toBeInTheDocument();
  });

  it("sidebar: verwendet für die Badge keine gefüllte goldene Fläche (Umriss/Text)", () => {
    const { container } = render(
      <FilterPanel mode="sidebar" criteria={criteria({ provider: "velora-studios" })} onApply={vi.fn()} onReset={vi.fn()} />,
    );
    expect(container.querySelectorAll(".bg-gold").length).toBe(0);
  });

  it("drawer: der Auslöser-Button zeigt die Anzahl aktiver Filter als Text", () => {
    render(<FilterPanel mode="drawer" criteria={criteria({ difficulty: "easy" })} onApply={vi.fn()} onReset={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /Filter/ });
    expect(trigger).toHaveTextContent("1");
  });

  it("drawer: ohne aktive Filter zeigt der Auslöser-Button keine Zahl", () => {
    render(<FilterPanel mode="drawer" criteria={criteria()} onApply={vi.fn()} onReset={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Filter" });
    expect(trigger.textContent).toBe("Filter");
  });
});
