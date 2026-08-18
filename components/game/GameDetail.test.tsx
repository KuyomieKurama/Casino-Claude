import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/state/AppProviders";
import { games } from "@/data/games";
import type { GameModeSummary } from "@/types/game-mode";
import type { GameEngineViewProps } from "@/types/engine";
import type { User } from "@/types/user";
import { GameDetail } from "./GameDetail";

const usePathnameMock = vi.fn(() => "/game/european-roulette");
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => usePathnameMock(),
}));

// `vi.mock`-Fabriken werden an den Dateianfang gehoben — `engineForMock` muss deshalb über
// vi.hoisted() entstehen (gleiches Muster wie app/admin/page.test.tsx).
const { engineForMock } = vi.hoisted(() => ({ engineForMock: vi.fn() }));

vi.mock("./engine/registry", () => ({
  engineFor: (id: string) => engineForMock(id),
}));

/**
 * Fake-Engine statt einer echten: Die eigentlichen Engines haben eigene Tests
 * (components/game/engine/**), hier geht es nur um die Verdrahtung
 * GameDetail → ModeSwitcher (Auftrag §3: Wechsel bei laufender Runde ablehnen). Als
 * `function`-Deklaration (nicht `const`), damit sie — anders als `engineForMock` — auch ohne
 * vi.hoisted() vor der oben gehobenen vi.mock()-Fabrik verfügbar ist (Funktionsdeklarationen
 * werden von JavaScript selbst vollständig gehoben).
 */
function FakeEngine({ onStatusChange }: GameEngineViewProps) {
  // Im Effekt, nicht während des Renderns: setRoundStatus() gehört GameDetail (dem Elternteil),
  // ein Aufruf während des Kind-Renderns wäre unsicher.
  useEffect(() => {
    onStatusChange?.("playing");
  }, [onStatusChange]);
  return <div>Fake-Spielfläche</div>;
}

const european = games.find((g) => g.id === "g-european-roulette")!;
const neonNights = games.find((g) => g.id === "g-neon-nights")!;

const rouletteModes: GameModeSummary[] = [
  { id: "g-european-roulette", slug: "european-roulette", label: "Europäisch", status: "active", isDefault: true, isLivePresentation: false, minBetMinor: 10, maxBetMinor: 5000 },
  { id: "g-american-roulette", slug: "american-roulette", label: "Amerikanisch", status: "active", isDefault: false, isLivePresentation: false, minBetMinor: 10, maxBetMinor: 5000 },
  { id: "g-live-roulette-demo", slug: "live-roulette-demo", label: "Live", status: "active", isDefault: false, isLivePresentation: true, minBetMinor: 50, maxBetMinor: 5000 },
];

// Wie loadGameModeDetail() für einen Einzelmodus-Titel: die Geschwisterliste enthält nur den
// Modus selbst (Länge 1) — genau der Fall, in dem ModeSwitcher sich selbst ausblendet.
const neonNightsModes: GameModeSummary[] = [
  { id: "g-neon-nights", slug: "neon-nights", label: "Standard", status: "active", isDefault: true, isLivePresentation: false, minBetMinor: 10, maxBetMinor: 1000 },
];

// jsdom implementiert scrollIntoView nicht — GameDetail ruft es beim Öffnen der Spielfläche auf.
Element.prototype.scrollIntoView = vi.fn();

const player: User = { id: "u-1", displayName: "Spielerin", email: "p@example.com", role: "user", isGuest: false };

/**
 * Standardmäßig ANGEMELDET (`player`): die bestehenden Tests unten prüfen den Rundenablauf und
 * die Modusauswahl, nicht die Anmeldepflicht selbst — die hat einen eigenen describe-Block unten,
 * der gezielt `user: null` übergibt.
 */
function renderDetail(
  game = european,
  siblingModes: readonly GameModeSummary[] = rouletteModes,
  titleLabel = "Roulette",
  user: User | null = player,
) {
  return render(
    <AppProviders user={user}>
      <GameDetail game={game} siblingModes={siblingModes} titleLabel={titleLabel} />
    </AppProviders>,
  );
}

describe("GameDetail — Moduswechsel (Auftrag §3)", () => {
  it("zeigt die Modusauswahl mit dem aktiven Modus erkennbar markiert", () => {
    engineForMock.mockReturnValue(undefined);
    renderDetail();
    expect(screen.getByRole("group", { name: "Roulette: Modus wählen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Europäisch.*aktiver Modus/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Zu Modus Amerikanisch wechseln" })).toHaveAttribute("href", "/game/american-roulette");
  });

  it("zeigt keine Modusauswahl für einen Titel mit nur einem Modus", () => {
    engineForMock.mockReturnValue(undefined);
    renderDetail(neonNights, neonNightsModes, "Neon Nights");
    expect(screen.queryByRole("group", { name: /Modus wählen/ })).not.toBeInTheDocument();
  });

  it("lehnt den Moduswechsel ab, während die Engine eine laufende Runde meldet (roundStatus 'playing')", async () => {
    const user = userEvent.setup();
    engineForMock.mockReturnValue(FakeEngine);
    renderDetail();

    // Spielfläche öffnen — die Fake-Engine meldet sofort "playing" über onStatusChange.
    await user.click(screen.getByRole("button", { name: /Demo spielen/ }));
    expect(await screen.findByText("Fake-Spielfläche")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Zu Modus Amerikanisch wechseln" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/nicht möglich/);
  });
});

describe("GameDetail — Anmeldepflicht (Auftrag „Spielen nur angemeldet“)", () => {
  it("zeigt ohne Anmeldung Titel, Fakten und Auszahlungstabelle — der Katalog bleibt frei einsehbar", () => {
    engineForMock.mockReturnValue(undefined);
    renderDetail(european, rouletteModes, "Roulette", null);

    expect(screen.getByRole("heading", { name: european.name })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fakten zur Demo" })).toBeInTheDocument();
  });

  it("zeigt ohne Anmeldung einen Anmelde-Hinweis anstelle des Startknopfes", () => {
    // Truthy Engine (wie bei den Moduswechsel-Tests oben): der Login-Hinweis ersetzt den
    // Startknopf nur für spielbare Titel — ohne Engine würde ohnehin „Demo folgt" stehen,
    // unabhängig vom Anmeldezustand, und der Test würde nichts über die Anmeldepflicht beweisen.
    engineForMock.mockReturnValue(FakeEngine);
    renderDetail(european, rouletteModes, "Roulette", null);

    expect(screen.queryByRole("button", { name: /Demo spielen/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Zum Spielen ist eine Anmeldung nötig/)).toBeInTheDocument();
  });

  it("der Anmelde-Link führt nach /login mit einem next-Parameter zurück auf dieselbe Spielseite", () => {
    engineForMock.mockReturnValue(FakeEngine);
    renderDetail(european, rouletteModes, "Roulette", null);

    const link = screen.getByRole("link", { name: /Anmelden zum Spielen/ });
    expect(link).toHaveAttribute("href", `/login?next=${encodeURIComponent("/game/european-roulette")}`);
  });

  it("zeigt angemeldet weiterhin den Startknopf, keinen Anmelde-Hinweis", () => {
    engineForMock.mockReturnValue(FakeEngine);
    renderDetail();

    expect(screen.getByRole("button", { name: /Demo spielen/ })).toBeInTheDocument();
    expect(screen.queryByText(/Zum Spielen ist eine Anmeldung nötig/)).not.toBeInTheDocument();
  });
});
