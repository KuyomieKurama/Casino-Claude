import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetStorageForTests } from "@/lib/storage";
import { __resetSoundStoreForTests } from "./sound-store";
import { SoundToggle } from "./SoundToggle";

describe("SoundToggle", () => {
  beforeEach(() => {
    __resetSoundStoreForTests();
    __resetStorageForTests();
    window.localStorage.clear();
  });

  it("hat einen zugänglichen Namen und ist standardmäßig aus", () => {
    render(<SoundToggle />);
    const toggle = screen.getByRole("switch", { name: "Ton" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("ist tastaturbedienbar: Tab fokussiert, Enter schaltet um", async () => {
    const user = userEvent.setup();
    render(<SoundToggle />);
    await user.tab();
    const toggle = screen.getByRole("switch", { name: "Ton" });
    expect(toggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("ist tastaturbedienbar über die Leertaste", async () => {
    const user = userEvent.setup();
    render(<SoundToggle />);
    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("switch", { name: "Ton" })).toHaveAttribute("aria-checked", "true");
  });

  it("Zustand ist nicht allein über Farbe erkennbar: das Icon-Markup ändert sich strukturell mit aria-checked", async () => {
    const user = userEvent.setup();
    render(<SoundToggle />);
    const toggle = screen.getByRole("switch", { name: "Ton" });
    const iconOff = toggle.querySelector("svg")?.outerHTML;
    await user.click(toggle);
    const iconOn = toggle.querySelector("svg")?.outerHTML;
    expect(iconOff).toBeTruthy();
    expect(iconOn).toBeTruthy();
    expect(iconOn).not.toBe(iconOff);
  });

  it("Klick schaltet Ton um", async () => {
    const user = userEvent.setup();
    render(<SoundToggle />);
    const toggle = screen.getByRole("switch", { name: "Ton" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("erfüllt das 44×44-px-Touch-Ziel (icon-Variante)", () => {
    render(<SoundToggle />);
    expect(screen.getByRole("switch", { name: "Ton" }).className).toMatch(/size-11/);
  });

  it("erfüllt das 44-px-Touch-Ziel (labeled-Variante) und zeigt zusätzlich sichtbaren Text", () => {
    render(<SoundToggle variant="labeled" />);
    const toggle = screen.getByRole("switch", { name: "Ton" });
    expect(toggle.className).toMatch(/h-11/);
    expect(toggle).toHaveTextContent("Ton aus");
  });

  it("verwendet nie eine goldene Fläche (bg-gold) — Gold bleibt knapp", () => {
    const { container } = render(<SoundToggle variant="labeled" />);
    expect(container.querySelectorAll('[class*="bg-gold"]').length).toBe(0);
  });
});
