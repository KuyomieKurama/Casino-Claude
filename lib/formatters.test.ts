import { describe, expect, it } from "vitest";
import { formatCredits, formatCreditsSigned, formatCreditsWithUnit, formatDuration, formatDurationClock, formatMultiplier, formatPercent, parseCreditsInput } from "./formatters";
import { MAX_BALANCE_MINOR } from "./constants";

describe("Formatierung", () => {
  it("#8 formatiert korrekt, inklusive 0 und Maximalwert", () => {
    expect(formatCredits(0)).toBe("0,00");
    expect(formatCredits(1)).toBe("0,01");
    expect(formatCredits(10)).toBe("0,10");
    expect(formatCredits(1050)).toBe("10,50");
    expect(formatCredits(100_000)).toBe("1.000,00");
    expect(formatCredits(123_456_789)).toBe("1.234.567,89");
    expect(formatCredits(MAX_BALANCE_MINOR)).toBe("99.999.999,99");
    expect(formatCredits(-60)).toBe("−0,60");
    expect(formatCredits(Number.NaN)).toBe("–");
    expect(formatCreditsWithUnit(100_000)).toBe("1.000,00 Credits");
  });

  it("Vorzeichen für Bewegungen: netto, nie „Gewinn“ bei Rückgabe unter Einsatz", () => {
    expect(formatCreditsSigned(1250)).toBe("+12,50");
    expect(formatCreditsSigned(-60)).toBe("−0,60");
    expect(formatCreditsSigned(0)).toBe("±0,00");
  });

  it("parst Nutzereingaben in Hundertstel oder lehnt sie ab", () => {
    expect(parseCreditsInput("1,50")).toBe(150);
    expect(parseCreditsInput("1.5")).toBe(150);
    expect(parseCreditsInput("10")).toBe(1000);
    expect(parseCreditsInput("0,1")).toBe(10);
    expect(parseCreditsInput("abc")).toBeNull();
    expect(parseCreditsInput("1,234")).toBeNull();
    expect(parseCreditsInput("-5")).toBeNull();
    expect(parseCreditsInput("")).toBeNull();
  });

  it("Prozent, Multiplikator, Dauer", () => {
    expect(formatPercent(0.95)).toBe("95,0 %");
    expect(formatPercent(0.9625, 2)).toBe("96,25 %");
    expect(formatMultiplier(0.5)).toBe("0,5×");
    expect(formatMultiplier(100)).toBe("100×");
    expect(formatDuration(0)).toBe("0 Min.");
    expect(formatDuration(59_000)).toBe("0 Min.");
    expect(formatDuration(3_600_000)).toBe("1 Std. 0 Min.");
    expect(formatDuration(5_400_000)).toBe("1 Std. 30 Min.");
    expect(formatDurationClock(65_000)).toBe("01:05");
    expect(formatDurationClock(3_665_000)).toBe("1:01:05");
  });
});
