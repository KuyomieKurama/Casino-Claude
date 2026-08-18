import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { HistoryFilters } from "./HistoryFilters";

describe("HistoryFilters", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("navigiert mit dem neuen Zeitraum und setzt dabei die Seite zurück (kein cursors-Parameter)", async () => {
    const user = userEvent.setup();
    render(<HistoryFilters range="all" gameId="" gameOptions={[{ value: "g-neon-nights", label: "Neon Nights" }]} />);

    await user.selectOptions(screen.getByLabelText("Zeitraum"), "Letzte 7 Tage");

    expect(pushMock).toHaveBeenCalledWith("/history?range=7d");
  });

  it("navigiert mit dem gewählten Spiel und behält den aktuellen Zeitraum bei", async () => {
    const user = userEvent.setup();
    render(<HistoryFilters range="7d" gameId="" gameOptions={[{ value: "g-neon-nights", label: "Neon Nights" }]} />);

    await user.selectOptions(screen.getByLabelText("Spiel"), "Neon Nights");

    expect(pushMock).toHaveBeenCalledWith("/history?range=7d&gameId=g-neon-nights");
  });

  it("navigiert zu /history ohne Suchparameter, wenn beide Filter auf 'alle' zurückgesetzt werden", async () => {
    const user = userEvent.setup();
    render(<HistoryFilters range="today" gameId="g-neon-nights" gameOptions={[{ value: "g-neon-nights", label: "Neon Nights" }]} />);

    await user.selectOptions(screen.getByLabelText("Zeitraum"), "Gesamt");

    expect(pushMock).toHaveBeenCalledWith("/history?gameId=g-neon-nights");
  });
});
