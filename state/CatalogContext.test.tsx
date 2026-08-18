import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Game } from "@/types/game";
import { games as staticGames } from "@/data/catalog";
import { PersistenceProvider } from "./PersistenceContext";
import { CatalogProvider, useCatalog } from "./CatalogContext";

const fakeDbGame: Game = {
  ...staticGames[0]!,
  id: "g-aus-der-datenbank",
  name: "Aus der Datenbank",
};

function Probe() {
  const { games } = useCatalog();
  return <p>Anzahl: {games.length}, erstes: {games[0]?.name}</p>;
}

function renderWithCatalog(initialGames?: readonly Game[]) {
  return render(
    <PersistenceProvider>
      <CatalogProvider initialGames={initialGames}>
        <Probe />
      </CatalogProvider>
    </PersistenceProvider>,
  );
}

describe("CatalogProvider — Katalog aus der Datenbank (Auftrag §1)", () => {
  it("fällt ohne initialGames auf data/catalog.ts zurück (bestehende Tests bleiben unverändert lauffähig)", () => {
    renderWithCatalog(undefined);
    expect(screen.getByText(`Anzahl: ${staticGames.length}, erstes: ${staticGames[0]!.name}`)).toBeInTheDocument();
  });

  it("übernimmt initialGames, wenn app/layout.tsx den Katalog über die Repositories geladen hat", () => {
    renderWithCatalog([fakeDbGame]);
    expect(screen.getByText("Anzahl: 1, erstes: Aus der Datenbank")).toBeInTheDocument();
  });
});
