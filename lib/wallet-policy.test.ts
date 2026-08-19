import { describe, expect, it } from "vitest";
import type { Wallet } from "@/types/wallet";
import { MAX_BALANCE_MINOR } from "@/lib/constants";
import {
  availableMinor,
  checkFreeSpinAvailable,
  checkFundsAvailable,
  checkMaxBalanceAfterCredit,
  checkRaiseAllowed,
  checkRgNotBlocked,
  checkRoundNotInFlight,
  checkSettleReturnOverride,
  checkStakeRange,
  computeRaisedMaxReturn,
  resolveRoundMaxReturn,
  splitStakeAcrossBalances,
} from "./wallet-policy";

const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  balanceMinor: 1000,
  bonusBalanceMinor: 0,
  freeSpins: 0,
  roundInFlight: false,
  ...over,
});

describe("checkRgNotBlocked", () => {
  it("lehnt jede Aktion ab, wenn die Selbstsperre aktiv ist", () => {
    expect(checkRgNotBlocked(true)).toEqual({ ok: false, code: "RG_BLOCKED" });
  });

  it("erlaubt die Aktion, wenn keine Sperre aktiv ist", () => {
    expect(checkRgNotBlocked(false)).toEqual({ ok: true, value: undefined });
  });
});

describe("checkRoundNotInFlight", () => {
  it("lehnt ab, wenn bereits eine Runde offen ist", () => {
    expect(checkRoundNotInFlight(true)).toEqual({ ok: false, code: "ROUND_IN_FLIGHT" });
  });

  it("erlaubt, wenn keine Runde offen ist", () => {
    expect(checkRoundNotInFlight(false)).toEqual({ ok: true, value: undefined });
  });
});

describe("checkStakeRange", () => {
  it("erlaubt den Einsatz exakt am Minimum", () => {
    expect(checkStakeRange(10, 10, 1000)).toEqual({ ok: true, value: 10 });
  });

  it("erlaubt den Einsatz exakt am Maximum", () => {
    expect(checkStakeRange(1000, 10, 1000)).toEqual({ ok: true, value: 1000 });
  });

  it("lehnt einen Einsatz von 0 ab", () => {
    expect(checkStakeRange(0, 0, 1000)).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  it("lehnt einen negativen Einsatz ab", () => {
    expect(checkStakeRange(-10, 0, 1000)).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  it("lehnt einen nicht ganzzahligen Einsatz ab", () => {
    expect(checkStakeRange(10.5, 10, 1000)).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  it("lehnt einen Einsatz unter dem Mindesteinsatz ab", () => {
    expect(checkStakeRange(9, 10, 1000)).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  it("lehnt einen Einsatz über dem Höchsteinsatz ab", () => {
    expect(checkStakeRange(1001, 10, 1000)).toEqual({ ok: false, code: "INVALID_STAKE" });
  });
});

describe("resolveRoundMaxReturn", () => {
  it("nicht-interaktive Runden erhalten die Obergrenze gleich dem Ergebnis, ohne Prüfung", () => {
    expect(resolveRoundMaxReturn(false, 200, undefined)).toEqual({ ok: true, value: 200 });
  });

  it("interaktive Runden übernehmen eine gültige deklarierte Obergrenze", () => {
    expect(resolveRoundMaxReturn(true, 200, 300)).toEqual({ ok: true, value: 300 });
  });

  it("interaktive Runden ohne deklarierte Obergrenze werden abgelehnt", () => {
    expect(resolveRoundMaxReturn(true, 200, undefined)).toEqual({ ok: false, code: "RETURN_OUT_OF_RANGE" });
  });

  it("interaktive Runden mit Obergrenze unter dem Ergebnis werden abgelehnt", () => {
    expect(resolveRoundMaxReturn(true, 500, 300)).toEqual({ ok: false, code: "RETURN_OUT_OF_RANGE" });
  });

  it("interaktive Runden mit nicht ganzzahliger Obergrenze werden abgelehnt", () => {
    expect(resolveRoundMaxReturn(true, 200, 300.5)).toEqual({ ok: false, code: "RETURN_OUT_OF_RANGE" });
  });
});

describe("checkFreeSpinAvailable", () => {
  it("lehnt ab, wenn keine Freirunden übrig sind", () => {
    expect(checkFreeSpinAvailable(0)).toEqual({ ok: false, code: "NO_FREE_SPINS" });
  });

  it("erlaubt, wenn mindestens eine Freirunde übrig ist", () => {
    expect(checkFreeSpinAvailable(1)).toEqual({ ok: true, value: undefined });
  });
});

describe("checkFundsAvailable", () => {
  it("lehnt einen Einsatz über dem verfügbaren Guthaben ab", () => {
    const w = wallet({ balanceMinor: 100, bonusBalanceMinor: 0 });
    expect(checkFundsAvailable(w, 101)).toEqual({ ok: false, code: "INSUFFICIENT_FUNDS" });
  });

  it("erlaubt einen Einsatz exakt in Höhe des verfügbaren Guthabens", () => {
    const w = wallet({ balanceMinor: 100, bonusBalanceMinor: 0 });
    expect(checkFundsAvailable(w, 100)).toEqual({ ok: true, value: undefined });
  });

  it("berücksichtigt Bonusguthaben als Teil des verfügbaren Guthabens", () => {
    const w = wallet({ balanceMinor: 50, bonusBalanceMinor: 50 });
    expect(checkFundsAvailable(w, 100)).toEqual({ ok: true, value: undefined });
    expect(checkFundsAvailable(w, 101)).toEqual({ ok: false, code: "INSUFFICIENT_FUNDS" });
  });
});

describe("availableMinor", () => {
  it("summiert Guthaben und Bonusguthaben ohne Bedingungen", () => {
    expect(availableMinor(wallet({ balanceMinor: 300, bonusBalanceMinor: 50 }))).toBe(350);
  });
});

describe("splitStakeAcrossBalances", () => {
  it("deckt den gesamten Einsatz aus dem Bonusguthaben, wenn genug vorhanden ist", () => {
    const w = wallet({ balanceMinor: 1000, bonusBalanceMinor: 500 });
    expect(splitStakeAcrossBalances(w, 200)).toEqual({ fromBonus: 200, fromBalance: 0 });
  });

  it("deckt den Einsatz teilweise aus dem Bonusguthaben, den Rest aus dem übrigen Guthaben", () => {
    const w = wallet({ balanceMinor: 1000, bonusBalanceMinor: 50 });
    expect(splitStakeAcrossBalances(w, 200)).toEqual({ fromBonus: 50, fromBalance: 150 });
  });

  it("nutzt ausschließlich das übrige Guthaben, wenn kein Bonus vorhanden ist", () => {
    const w = wallet({ balanceMinor: 1000, bonusBalanceMinor: 0 });
    expect(splitStakeAcrossBalances(w, 200)).toEqual({ fromBonus: 0, fromBalance: 200 });
  });
});

describe("checkSettleReturnOverride", () => {
  const interactiveRound = { interactive: true, maxReturnMinor: 300 };

  it("erlaubt eine Rückgabe exakt auf der Obergrenze", () => {
    expect(checkSettleReturnOverride(interactiveRound, 300)).toEqual({ ok: true, value: 300 });
  });

  it("lehnt eine Rückgabe ein Hundertstel über der Obergrenze ab", () => {
    expect(checkSettleReturnOverride(interactiveRound, 301)).toEqual({ ok: false, code: "RETURN_OUT_OF_RANGE" });
  });

  it("lehnt eine negative Rückgabe ab", () => {
    expect(checkSettleReturnOverride(interactiveRound, -1)).toEqual({ ok: false, code: "RETURN_OUT_OF_RANGE" });
  });

  it("lehnt eine nicht ganzzahlige Rückgabe ab", () => {
    expect(checkSettleReturnOverride(interactiveRound, 150.5)).toEqual({ ok: false, code: "RETURN_OUT_OF_RANGE" });
  });

  it("lehnt jede abweichende Rückgabe bei nicht-interaktiven Runden ab", () => {
    expect(checkSettleReturnOverride({ interactive: false, maxReturnMinor: 300 }, 100)).toEqual({
      ok: false,
      code: "RETURN_OUT_OF_RANGE",
    });
  });
});

describe("checkRaiseAllowed", () => {
  const baseRound = { interactive: true, usedFreeSpin: false, stakeMinor: 100, baseStakeMinor: 100 };

  it("erlaubt eine Erhöhung exakt auf das Vierfache des Grundeinsatzes", () => {
    expect(checkRaiseAllowed(baseRound, 300)).toEqual({ ok: true, value: 300 });
  });

  it("lehnt eine Erhöhung ein Hundertstel über dem Vierfachen ab", () => {
    const round = { ...baseRound, stakeMinor: 400 };
    expect(checkRaiseAllowed(round, 1)).toEqual({ ok: false, code: "RAISE_NOT_ALLOWED" });
  });

  it("lehnt eine Erhöhung bei nicht-interaktiven Runden ab", () => {
    expect(checkRaiseAllowed({ ...baseRound, interactive: false }, 50)).toEqual({ ok: false, code: "RAISE_NOT_ALLOWED" });
  });

  it("lehnt eine Erhöhung bei Freirunden-Ursprung ab", () => {
    expect(checkRaiseAllowed({ ...baseRound, usedFreeSpin: true }, 50)).toEqual({ ok: false, code: "RAISE_NOT_ALLOWED" });
  });

  it("lehnt eine nicht ganzzahlige oder nicht positive Erhöhung ab", () => {
    expect(checkRaiseAllowed(baseRound, 0)).toEqual({ ok: false, code: "INVALID_STAKE" });
    expect(checkRaiseAllowed(baseRound, -50)).toEqual({ ok: false, code: "INVALID_STAKE" });
    expect(checkRaiseAllowed(baseRound, 12.5)).toEqual({ ok: false, code: "INVALID_STAKE" });
  });
});

describe("computeRaisedMaxReturn", () => {
  it("lässt die Obergrenze im selben Verhältnis wie den Einsatz mitwachsen", () => {
    expect(computeRaisedMaxReturn({ stakeMinor: 100, maxReturnMinor: 500 }, 100)).toBe(1000);
  });

  it("rundet auf ganze Hundertstel", () => {
    expect(computeRaisedMaxReturn({ stakeMinor: 3, maxReturnMinor: 10 }, 1)).toBe(13);
  });
});

describe("checkMaxBalanceAfterCredit", () => {
  it("erlaubt eine Gutschrift, die die Obergrenze exakt erreicht", () => {
    expect(checkMaxBalanceAfterCredit(MAX_BALANCE_MINOR - 100, 100)).toEqual({ ok: true, value: 100 });
  });

  it("lehnt eine Gutschrift ab, die die Obergrenze um ein Hundertstel überschreitet", () => {
    expect(checkMaxBalanceAfterCredit(MAX_BALANCE_MINOR - 100, 101)).toEqual({ ok: false, code: "MAX_BALANCE" });
  });
});
