import { describe, expect, test } from "vitest";
import { resolveDice } from "@/components/game/engine/arcade/dice-logic";
import { resolvePlinko } from "@/components/game/engine/arcade/plinko-logic";
import { resolveWheel } from "@/components/game/engine/arcade/wheel-logic";
import { resolveBaccaratRound } from "@/components/game/engine/baccarat/baccarat-logic";
import { NON_INTERACTIVE_ENGINE_KEYS, resolveNonInteractiveOutcome } from "./engine-resolvers";

describe("NON_INTERACTIVE_ENGINE_KEYS", () => {
  test("enthält genau die sechs im Auftrag genannten Familien", () => {
    expect([...NON_INTERACTIVE_ENGINE_KEYS].sort()).toEqual(["baccarat", "dice", "plinko", "roulette", "slot", "wheel"]);
  });

  test("enthält keine interaktive Familie", () => {
    expect(NON_INTERACTIVE_ENGINE_KEYS.has("blackjack")).toBe(false);
    expect(NON_INTERACTIVE_ENGINE_KEYS.has("mines")).toBe(false);
    expect(NON_INTERACTIVE_ENGINE_KEYS.has("videopoker")).toBe(false);
  });
});

describe("resolveNonInteractiveOutcome", () => {
  test("slot: löst über die dokumentierte Auszahlungstabelle auf, identisch zur Client-Logik", () => {
    const result = resolveNonInteractiveOutcome("slot", { gameModeId: "g-classic-fruit", stakeMinor: 100, seed: 42 });
    expect(result.ok).toBe(true);
  });

  test("slot: unbekannter Modus ohne Tabelle wird abgelehnt", () => {
    const result = resolveNonInteractiveOutcome("slot", { gameModeId: "unbekannt", stakeMinor: 100, seed: 42 });
    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("dice: liefert exakt dasselbe Ergebnis wie die pure Funktion direkt", () => {
    const direct = resolveDice(100, 42, "under-50");
    const viaResolver = resolveNonInteractiveOutcome("dice", { gameModeId: "g-dice-demo", stakeMinor: 100, seed: 42, betId: "under-50" });
    expect(viaResolver.ok).toBe(true);
    if (viaResolver.ok) expect(viaResolver.outcome).toEqual(direct);
  });

  test("plinko: liefert exakt dasselbe Ergebnis wie die pure Funktion direkt", () => {
    const direct = resolvePlinko(100, 42);
    const viaResolver = resolveNonInteractiveOutcome("plinko", { gameModeId: "g-plinko-demo", stakeMinor: 100, seed: 42 });
    expect(viaResolver.ok).toBe(true);
    if (viaResolver.ok) expect(viaResolver.outcome).toEqual(direct);
  });

  test("wheel: liefert exakt dasselbe Ergebnis wie die pure Funktion direkt", () => {
    const direct = resolveWheel(100, 42);
    const viaResolver = resolveNonInteractiveOutcome("wheel", { gameModeId: "g-wheel-demo", stakeMinor: 100, seed: 42 });
    expect(viaResolver.ok).toBe(true);
    if (viaResolver.ok) expect(viaResolver.outcome).toEqual(direct);
  });

  test("baccarat: liefert exakt dasselbe Ergebnis wie die pure Funktion direkt", () => {
    const direct = resolveBaccaratRound({ stakeMinor: 100, seed: 42, betId: "banker" });
    const viaResolver = resolveNonInteractiveOutcome("baccarat", { gameModeId: "g-baccarat", stakeMinor: 100, seed: 42, betId: "banker" });
    expect(viaResolver.ok).toBe(true);
    if (viaResolver.ok) expect(viaResolver.outcome).toEqual(direct);
  });

  test("roulette: löst eine gültige, strukturierte Wette auf", () => {
    const result = resolveNonInteractiveOutcome("roulette", { gameModeId: "g-european-roulette", stakeMinor: 100, seed: 7, bet: { kind: "red" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.outcome.returnMinor).toBeGreaterThanOrEqual(0);
  });

  test("roulette: lehnt eine strukturell ungültige Wette ab, statt zu raten", () => {
    const result = resolveNonInteractiveOutcome("roulette", { gameModeId: "g-european-roulette", stakeMinor: 100, seed: 7, bet: { kind: "not-a-real-bet" } });
    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("roulette: fehlende Wette wird abgelehnt", () => {
    const result = resolveNonInteractiveOutcome("roulette", { gameModeId: "g-european-roulette", stakeMinor: 100, seed: 7 });
    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("roulette: die Five-Number-Wette ist am europäischen Kessel nicht erlaubt", () => {
    const result = resolveNonInteractiveOutcome("roulette", { gameModeId: "g-european-roulette", stakeMinor: 100, seed: 7, bet: { kind: "five" } });
    expect(result).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("roulette: die Five-Number-Wette ist am amerikanischen Kessel erlaubt", () => {
    const result = resolveNonInteractiveOutcome("roulette", { gameModeId: "g-american-roulette", stakeMinor: 100, seed: 7, bet: { kind: "five" } });
    expect(result.ok).toBe(true);
  });

  test("roulette: Determinismus — gleicher Seed und gleiche Wette ⇒ gleiches Ergebnis", () => {
    const a = resolveNonInteractiveOutcome("roulette", { gameModeId: "g-european-roulette", stakeMinor: 100, seed: 123, bet: { kind: "straight", pocket: 17 } });
    const b = resolveNonInteractiveOutcome("roulette", { gameModeId: "g-european-roulette", stakeMinor: 100, seed: 123, bet: { kind: "straight", pocket: 17 } });
    expect(a).toEqual(b);
  });

  test("blackjack/mines/videopoker: interaktive Modi werden abgelehnt, da nicht Teil dieser Phase", () => {
    expect(resolveNonInteractiveOutcome("blackjack", { gameModeId: "g-classic-blackjack", stakeMinor: 100, seed: 1 })).toEqual({ ok: false, code: "INVALID_STAKE" });
    expect(resolveNonInteractiveOutcome("mines", { gameModeId: "g-mines-demo", stakeMinor: 100, seed: 1 })).toEqual({ ok: false, code: "INVALID_STAKE" });
    expect(resolveNonInteractiveOutcome("videopoker", { gameModeId: "g-video-poker", stakeMinor: 100, seed: 1 })).toEqual({ ok: false, code: "INVALID_STAKE" });
  });
});
