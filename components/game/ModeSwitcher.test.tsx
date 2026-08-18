import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GameModeSummary } from "@/types/game-mode";
import { ModeSwitcher } from "./ModeSwitcher";

const europaeisch: GameModeSummary = {
  id: "g-european-roulette",
  slug: "european-roulette",
  label: "Europäisch",
  status: "active",
  isDefault: true,
  isLivePresentation: false,
  minBetMinor: 10,
  maxBetMinor: 5000,
};

const amerikanisch: GameModeSummary = {
  id: "g-american-roulette",
  slug: "american-roulette",
  label: "Amerikanisch",
  status: "active",
  isDefault: false,
  isLivePresentation: false,
  minBetMinor: 10,
  maxBetMinor: 5000,
};

const gesperrterModus: GameModeSummary = {
  id: "g-live-roulette-demo",
  slug: "live-roulette-demo",
  label: "Live",
  status: "inactive",
  isDefault: false,
  isLivePresentation: true,
  minBetMinor: 50,
  maxBetMinor: 5000,
};

describe("ModeSwitcher", () => {
  it("zeigt bei nur einem Modus keine Modusauswahl (Auftrag §3)", () => {
    const { container } = render(
      <ModeSwitcher modes={[europaeisch]} activeModeId={europaeisch.id} titleLabel="Roulette" roundInProgress={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("markiert den aktiven Modus über aria-current UND sichtbaren Text/Icon, nicht nur über Farbe", () => {
    render(
      <ModeSwitcher modes={[europaeisch, amerikanisch]} activeModeId={europaeisch.id} titleLabel="Roulette" roundInProgress={false} />,
    );
    const active = screen.getByRole("link", { name: /Europäisch.*aktiver Modus/ });
    expect(active).toHaveAttribute("aria-current", "page");

    const inactive = screen.getByRole("link", { name: "Zu Modus Amerikanisch wechseln" });
    expect(inactive).not.toHaveAttribute("aria-current");
  });

  it("jeder verfügbare Modus ist ein Link auf seine eigene Route (Wechsel ohne Umweg über die Lobby)", () => {
    render(
      <ModeSwitcher modes={[europaeisch, amerikanisch]} activeModeId={europaeisch.id} titleLabel="Roulette" roundInProgress={false} />,
    );
    const link = screen.getByRole("link", { name: "Zu Modus Amerikanisch wechseln" });
    expect(link).toHaveAttribute("href", "/game/american-roulette");
  });

  it("ein deaktivierter Modus erscheint (nicht versteckt), ist aber kein Link und als nicht verfügbar erkennbar", () => {
    render(
      <ModeSwitcher modes={[europaeisch, gesperrterModus]} activeModeId={europaeisch.id} titleLabel="Roulette" roundInProgress={false} />,
    );
    expect(screen.queryByRole("link", { name: /Live/ })).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Live.*zurzeit nicht verfügbar/ });
    expect(button).toBeDisabled();
    expect(screen.getByText("(nicht verfügbar)")).toBeInTheDocument();
  });

  it("lehnt einen Wechsel während einer laufenden Runde ab und zeigt eine verständliche Meldung, statt die Runde still zu verwerfen", async () => {
    const user = userEvent.setup();
    render(
      <ModeSwitcher modes={[europaeisch, amerikanisch]} activeModeId={europaeisch.id} titleLabel="Roulette" roundInProgress />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Zu Modus Amerikanisch wechseln" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/nicht möglich/);
    expect(alert).toHaveTextContent(/Amerikanisch/);
  });

  it("wechselt ohne laufende Runde anstandslos (keine Blockiermeldung)", async () => {
    const user = userEvent.setup();
    render(
      <ModeSwitcher modes={[europaeisch, amerikanisch]} activeModeId={europaeisch.id} titleLabel="Roulette" roundInProgress={false} />,
    );
    await user.click(screen.getByRole("link", { name: "Zu Modus Amerikanisch wechseln" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("die Gruppe hat einen zugänglichen Namen über die Titelüberschrift", () => {
    render(
      <ModeSwitcher modes={[europaeisch, amerikanisch]} activeModeId={europaeisch.id} titleLabel="Roulette" roundInProgress={false} />,
    );
    expect(screen.getByRole("group", { name: "Roulette: Modus wählen" })).toBeInTheDocument();
  });
});
