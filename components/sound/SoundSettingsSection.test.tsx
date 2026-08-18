import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetStorageForTests } from "@/lib/storage";
import { __resetSoundStoreForTests } from "./sound-store";
import { SoundSettingsSection } from "./SoundSettingsSection";

describe("SoundSettingsSection", () => {
  beforeEach(() => {
    __resetSoundStoreForTests();
    __resetStorageForTests();
    window.localStorage.clear();
  });

  it("zeigt die Überschrift 'Ton' und erklärt den Opt-in-Charakter", () => {
    render(<SoundSettingsSection />);
    expect(screen.getByRole("heading", { level: 2, name: "Ton" })).toBeInTheDocument();
    expect(screen.getByText(/standardmäßig aus/i)).toBeInTheDocument();
  });

  it("Lautstärkeregler ist deaktiviert, solange Ton aus ist", () => {
    render(<SoundSettingsSection />);
    expect(screen.getByLabelText("Lautstärke")).toBeDisabled();
  });

  it("Lautstärkeregler wird nach Aktivierung bedienbar und ruft setVolume mit dem 0..1-Wert auf", async () => {
    const user = userEvent.setup();
    render(<SoundSettingsSection />);
    await user.click(screen.getByRole("switch", { name: "Ton" }));
    const slider = screen.getByLabelText("Lautstärke") as HTMLInputElement;
    expect(slider).toBeEnabled();

    // fireEvent statt Tippen: type="range" unterstützt keine Texteingabe; Gegenstand des Tests
    // ist, dass eine Änderung korrekt auf 0..1 umgerechnet wird (onChange → setVolume). Ein roher
    // DOM-.value-Zugriff + natives "change"-Event reicht bei kontrollierten React-Inputs nicht
    // aus (React verfolgt den nativen Value-Setter selbst) — testing-librarys fireEvent.change
    // löst das korrekt über den React-eigenen Change-Handler aus.
    fireEvent.change(slider, { target: { value: "30" } });
    expect(screen.getByText("30 %")).toBeInTheDocument();
  });

  it("Umschalter und Regler erfüllen die 44-px-Touch-Ziel-Klasse", () => {
    render(<SoundSettingsSection />);
    expect(screen.getByRole("switch", { name: "Ton" }).className).toMatch(/h-11/);
    expect(screen.getByLabelText("Lautstärke").className).toMatch(/h-11/);
  });

  it("verwendet höchstens keine goldene Fläche (Gold bleibt knapp)", () => {
    const { container } = render(<SoundSettingsSection />);
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBe(0);
  });
});
