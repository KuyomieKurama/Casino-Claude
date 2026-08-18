import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppProviders } from "@/state/AppProviders";
import { __resetStorageForTests, writeSlice, flushNow } from "@/lib/storage";
import { STORAGE_KEY, START_BALANCE_MINOR } from "@/lib/constants";
import { useWallet } from "./WalletContext";

/**
 * Auftrag §1/§4: die Guthabenanzeige zeigt beim Laden den serverseitig gelesenen Stand, nicht
 * erst nach der ersten Runde und nicht einen veralteten LocalStorage-Wert. Dieser Test prüft die
 * Verdrahtung AppProviders(walletSnapshot) ⇒ WalletProvider ⇒ Reducer — nicht die Anzeige-
 * Komponenten selbst (die lesen nur `useWallet().wallet`, siehe BalanceDisplay/DemoWallet).
 */

function Probe() {
  const { hydrated, wallet } = useWallet();
  return (
    <div>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <span data-testid="demo">{wallet.demoBalanceMinor}</span>
      <span data-testid="bonus">{wallet.bonusBalanceMinor}</span>
      <span data-testid="spins">{wallet.freeSpins}</span>
    </div>
  );
}

describe("WalletContext — Server-Saldo beim Laden (Auftrag §1)", () => {
  beforeEach(() => {
    __resetStorageForTests();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it("ohne walletSnapshot-Prop: unverändertes Verhalten (Startguthaben, bestehende Tests bleiben kompatibel)", () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId("hydrated").textContent).toBe("true");
    expect(screen.getByTestId("demo").textContent).toBe(String(START_BALANCE_MINOR));
  });

  it("mit walletSnapshot-Prop: zeigt sofort den Serverstand, nicht das hartkodierte Startguthaben", () => {
    render(
      <AppProviders walletSnapshot={{ demoBalanceMinor: 42_000, bonusBalanceMinor: 500, freeSpins: 3 }}>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByTestId("hydrated").textContent).toBe("true");
    expect(screen.getByTestId("demo").textContent).toBe("42000");
    expect(screen.getByTestId("bonus").textContent).toBe("500");
    expect(screen.getByTestId("spins").textContent).toBe("3");
  });

  it("überschreibt einen veralteten LocalStorage-Stand aus einem früheren Besuch (kein Aufblitzen des alten Werts)", () => {
    // Simuliert einen früheren Besuch mit einem längst überholten Kontostand.
    writeSlice("wallet", { wallet: { demoBalanceMinor: 1, bonusBalanceMinor: 0, freeSpins: 0 }, transactions: [], nextSeq: 1 });
    flushNow();

    render(
      <AppProviders walletSnapshot={{ demoBalanceMinor: 77_000, bonusBalanceMinor: 0, freeSpins: 0 }}>
        <Probe />
      </AppProviders>,
    );

    // Der erste (und einzige, da synchron in denselben Effekten laufende) Anzeigewert ist bereits
    // der Serverstand — kein Zwischenschritt mit dem veralteten LocalStorage-Betrag „1".
    expect(screen.getByTestId("demo").textContent).toBe("77000");
  });
});
