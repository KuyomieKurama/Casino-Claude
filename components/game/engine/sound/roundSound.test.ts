import { describe, expect, it } from "vitest";
import { roundSettleSound } from "./roundSound";

/**
 * Kernregel gegen „Loss Disguised as Win" (ENGINE-BRIEF.md): "win" ausschließlich bei echtem
 * Netto-Gewinn. Eine Rückgabe, die den Einsatz nicht übersteigt, ist kein Gewinn — auch nicht,
 * wenn sie größer als 0 ist (Teilrückgabe) oder exakt dem Einsatz entspricht (Push).
 */
describe("roundSettleSound", () => {
  it("liefert 'win' bei echtem Netto-Gewinn (netMinor > 0)", () => {
    expect(roundSettleSound(1)).toBe("win");
    expect(roundSettleSound(100)).toBe("win");
    expect(roundSettleSound(999_999)).toBe("win");
  });

  it("liefert 'settle' bei einem Push (netMinor genau 0, Einsatz zurück)", () => {
    expect(roundSettleSound(0)).toBe("settle");
  });

  it("liefert 'settle' bei jedem Verlust, auch bei Teilrückgabe unter dem Einsatz", () => {
    expect(roundSettleSound(-1)).toBe("settle");
    expect(roundSettleSound(-50)).toBe("settle");
    // Teilrückgabe: 40 von 100 Einsatz zurück ⇒ netMinor -60 ⇒ Verlust, kein Gewinn.
    expect(roundSettleSound(-60)).toBe("settle");
    expect(roundSettleSound(-1_000_000)).toBe("settle");
  });

  it("liefert nie 'win' für netMinor <= 0 (Kernregel gegen Loss Disguised as Win)", () => {
    for (const net of [-1000, -100, -1, 0]) {
      expect(roundSettleSound(net)).not.toBe("win");
    }
  });
});
