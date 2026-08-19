import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchBar } from "./SearchBar";

describe("SearchBar — sichtbarer Zustand beim Tippen (Auftrag §3)", () => {
  it("zeigt einen Status-Text, solange die Eingabe noch nicht ausgewertet wurde", async () => {
    const user = userEvent.setup();
    render(<SearchBar value="" onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Spiele durchsuchen"), "a");

    expect(screen.getByRole("status")).toHaveTextContent("Suche wird aktualisiert.");
  });

  it("meldet keinen ausstehenden Zustand, solange nichts eingegeben wurde", () => {
    render(<SearchBar value="" onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("ruft onChange nach der Verzögerung mit dem eingegebenen Wert auf und beendet den ausstehenden Zustand", async () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Spiele durchsuchen"), { target: { value: "roulette" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Suche wird aktualisiert.");

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("roulette"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(""));
  });
});

describe("SearchBar — Leeren-Button bleibt dimensional stabil (kein Layoutsprung)", () => {
  it("der Leeren-Button ist bei leerem Feld unsichtbar, aber weiterhin im DOM vorhanden (kein Mount/Unmount-Sprung)", () => {
    const { container } = render(<SearchBar value="" onChange={vi.fn()} />);
    const button = container.querySelector('button[aria-label="Suche leeren"]');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-hidden", "true");
    expect(button).toHaveAttribute("tabindex", "-1");
    expect(button?.className).toMatch(/opacity-0/);
  });

  it("der Leeren-Button ist bei gefülltem Feld sichtbar und fokussierbar", () => {
    render(<SearchBar value="roulette" onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Suche leeren" });
    expect(button).not.toHaveAttribute("aria-hidden");
    expect(button).toHaveAttribute("tabindex", "0");
  });

  it("Leeren setzt den Wert zurück und fokussiert das Eingabefeld wieder", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchBar value="roulette" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Suche leeren" }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByLabelText("Spiele durchsuchen")).toHaveFocus();
  });
});
