import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetStorageForTests, loadPersisted } from "@/lib/storage";
import { __resetSoundStoreForTests } from "./sound-store";
import { useSound } from "./useSound";

/** Winziger Testträger, der den Hook-Zustand sichtbar macht und Bedienelemente für die Aktionen anbietet. */
function Harness() {
  const { play, enabled, setEnabled, volume, setVolume } = useSound();
  return (
    <div>
      <p data-testid="enabled">{String(enabled)}</p>
      <p data-testid="volume">{String(volume)}</p>
      <button type="button" onClick={() => setEnabled(!enabled)}>
        toggle
      </button>
      <button type="button" onClick={() => setVolume(volume + 1)}>
        volume-up-overflow
      </button>
      <button type="button" onClick={() => setVolume(-1)}>
        volume-down-overflow
      </button>
      <button type="button" onClick={() => play("click")}>
        play
      </button>
    </div>
  );
}

describe("useSound", () => {
  beforeEach(() => {
    __resetSoundStoreForTests();
    __resetStorageForTests();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("#DoD Standardzustand ist 'aus'", () => {
    render(<Harness />);
    expect(screen.getByTestId("enabled")).toHaveTextContent("false");
  });

  it("setEnabled schaltet Ton ein/aus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("enabled")).toHaveTextContent("false");
  });

  it("#DoD Lautstärke wird auf 0..1 begrenzt", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "volume-up-overflow" }));
    expect(screen.getByTestId("volume")).toHaveTextContent("1");
    await user.click(screen.getByRole("button", { name: "volume-down-overflow" }));
    expect(screen.getByTestId("volume")).toHaveTextContent("0");
  });

  it("#DoD play() wirft nie, auch bei deaktiviertem Ton und fehlendem Web Audio (jsdom)", async () => {
    // Wirft play() intern doch, propagiert das als abgelehntes Klick-Promise bzw. als Testfehler —
    // ein einfacher, erfolgreicher Klick belegt bereits "wirft nie".
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "play" }));
    expect(screen.getByRole("button", { name: "play" })).toBeInTheDocument();
  });

  it("#DoD play() wirft nie, auch wenn Ton aktiviert ist und Web Audio fehlt", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
    await user.click(screen.getByRole("button", { name: "play" }));
    expect(screen.getByRole("button", { name: "play" })).toBeInTheDocument();
  });

  it("Einstellung wird gespeichert und beim erneuten Laden (frischer Hook-Baum) wiederhergestellt", () => {
    // fireEvent statt userEvent: userEvent.click() wartet intern auf echte Timer (Pointer-Events),
    // was sich mit vi.useFakeTimers() blockiert — fireEvent.click() ist synchron und kollidiert
    // damit nicht.
    vi.useFakeTimers();
    const { unmount } = render(<Harness />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    });
    act(() => {
      vi.advanceTimersByTime(300); // Storage-Drosselung (lib/storage.ts::WRITE_THROTTLE_MS)
    });
    expect(loadPersisted().slices.soundPrefs).toEqual({ enabled: true, volume: 0.5 });

    unmount();
    __resetSoundStoreForTests(); // Simuliert einen neuen Seitenaufruf: Speicher weg, LocalStorage bleibt.
    render(<Harness />);
    expect(screen.getByTestId("enabled")).toHaveTextContent("true");
  });
});
