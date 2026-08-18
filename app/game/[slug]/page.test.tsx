import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadGameModeDetailMock = vi.fn();
const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
const gameDetailMock = vi.fn((props: unknown) => {
  void props; // Rückgabe ist statisch, die Props werden über gameDetailMock.mock.calls geprüft.
  return <div>GameDetail-Platzhalter</div>;
});

// server/db/client.ts importiert "server-only" — in Vitest (kein Next-Webpack-Alias) würde ein
// echter Import deshalb immer werfen. Gemockt statt real importiert, wie auch
// server/catalog/read-model.ts hier gemockt wird (dessen eigene DB-Anbindung prüft
// server/catalog/read-model.test.ts gegen PGlite).
vi.mock("@/server/db/client", () => ({ db: {} }));
vi.mock("@/server/catalog/read-model", () => ({
  loadGameModeDetail: (...args: unknown[]) => loadGameModeDetailMock(...args),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
  useSearchParams: () => new URLSearchParams(),
}));
// GameDetail selbst hat eigene Tests (components/game/GameDetail.test.tsx) — hier interessiert
// nur, WELCHE Props app/game/[slug]/page.tsx aus dem DB-Ergebnis zusammensetzt. Ein Mock statt
// eines echten Renders vermeidet außerdem, dass CatalogContext (data/catalog.ts-Fallback ohne
// initialGames) die hier absichtlich abweichenden Testwerte durch die echten Katalogdaten
// überdeckt (GameDetail sucht die Modus-ID zuerst in games aus useCatalog()).
vi.mock("@/components/game/GameDetail", () => ({
  GameDetail: (props: unknown) => gameDetailMock(props),
}));

import GamePage, { generateStaticParams } from "./page";
import { games as staticGames } from "@/data/games";

describe("app/game/[slug]/page.tsx", () => {
  beforeEach(() => {
    loadGameModeDetailMock.mockReset();
    notFoundMock.mockClear();
    gameDetailMock.mockClear();
  });

  it("generateStaticParams liest die Routenliste aus data/games.ts (kein DB-Zugriff zur Bauzeit)", () => {
    const params = generateStaticParams();
    expect(params).toHaveLength(staticGames.length);
    expect(params).toContainEqual({ slug: "european-roulette" });
    expect(loadGameModeDetailMock).not.toHaveBeenCalled();
  });

  it("liefert 404 für einen unbekannten Slug, ohne die Datenbank zu befragen", async () => {
    await expect(GamePage({ params: Promise.resolve({ slug: "gibt-es-nicht" }) })).rejects.toThrow("NOT_FOUND");
    expect(loadGameModeDetailMock).not.toHaveBeenCalled();
  });

  it("liefert 404, wenn die Datenbank keinen passenden Modus kennt", async () => {
    loadGameModeDetailMock.mockResolvedValueOnce(null);
    await expect(GamePage({ params: Promise.resolve({ slug: "european-roulette" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("übergibt Status und Einsatzgrenzen aus der Datenbank an GameDetail, nicht die statischen Werte", async () => {
    loadGameModeDetailMock.mockResolvedValueOnce({
      title: { id: "gm-roulette", name: "Roulette" },
      mode: {
        id: "g-european-roulette",
        slug: "european-roulette",
        label: "Europäisch",
        status: "active",
        isDefault: true,
        isLivePresentation: false,
        // Bewusst andere Zahlen als data/games.ts, um zu beweisen, dass sie von hier kommen.
        minBetMinor: 999,
        maxBetMinor: 8888,
      },
      siblings: [
        { id: "g-european-roulette", slug: "european-roulette", label: "Europäisch", status: "active", isDefault: true, isLivePresentation: false, minBetMinor: 999, maxBetMinor: 8888 },
        { id: "g-american-roulette", slug: "american-roulette", label: "Amerikanisch", status: "active", isDefault: false, isLivePresentation: false, minBetMinor: 10, maxBetMinor: 5000 },
      ],
    });

    const element = await GamePage({ params: Promise.resolve({ slug: "european-roulette" }) });
    render(element);

    expect(screen.getByText("GameDetail-Platzhalter")).toBeInTheDocument();
    expect(gameDetailMock).toHaveBeenCalledTimes(1);
    const [firstCallProps] = gameDetailMock.mock.calls[0]!;
    const props = firstCallProps as {
      game: { id: string; status: string; minDemoBetMinor: number; maxDemoBetMinor: number; rtpDemo?: number };
      siblingModes: unknown[];
      titleLabel: string;
    };
    expect(props.game.id).toBe("g-european-roulette");
    expect(props.game.status).toBe("active");
    expect(props.game.minDemoBetMinor).toBe(999);
    expect(props.game.maxDemoBetMinor).toBe(8888);
    // Präsentationsfelder ohne DB-Spalte (RTP, Beschreibung, Thumbnail, …) bleiben aus
    // data/catalog.ts erhalten — der DB-Override betrifft gezielt nur Status/Einsatzgrenzen.
    expect(props.game.rtpDemo).toBeDefined();
    expect(props.titleLabel).toBe("Roulette");
    expect(props.siblingModes).toHaveLength(2);
  });
});
