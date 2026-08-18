import { describe, expect, test } from "vitest";
import { minePositions, minesMultiplier, minesReturnMinor } from "@/components/game/engine/arcade/mines-logic";
import {
  applyMinesAction,
  checkMinesAction,
  minesPublicView,
  parseMinesPayload,
  settleMinesRound,
  startMinesRoundState,
} from "./mines-adapter";

/**
 * Adapter-Tests (Phase 3b, Auftrag §3/§4): der Adapter ruft ausschließlich die UNVERÄNDERTE
 * Fachlogik aus components/game/engine/arcade/mines-logic.ts auf. Schwerpunkt hier ist die
 * Sichtbarkeitsgrenze — der eigentliche Kern dieser Phase.
 */

const SEED = 777;

describe("mines-adapter — Zustandsableitung", () => {
  test("startMinesRoundState liest die Minenzahl aus betKey und startet mit 0 aufgedeckten Feldern", () => {
    const state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    expect(state.mines).toBe(3);
    expect(state.revealed).toEqual([]);
    expect(state.status).toBe("open");
  });

  test("ohne betKey greift die Standard-Minenzahl (3)", () => {
    const state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: null });
    expect(state.mines).toBe(3);
  });

  test("deterministisch: gleicher Seed und gleiche Aktionsfolge ⇒ gleicher Endzustand", () => {
    const a = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m1" });
    const b = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m1" });
    const positions = minePositions(SEED, 1);
    // Ein Feld wählen, das sicher nicht die Mine ist (falls positions[0] === 0, nimm ein anderes).
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;
    const nextA = applyMinesAction(a, "reveal", { cell: safeCell }, { seed: SEED });
    const nextB = applyMinesAction(b, "reveal", { cell: safeCell }, { seed: SEED });
    expect(nextA).toEqual(nextB);
  });
});

describe("mines-adapter — Aktionsprüfung", () => {
  test("reveal auf ein gültiges, noch nicht aufgedecktes Feld ist erlaubt", () => {
    const state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    expect(checkMinesAction(state, "reveal", { cell: 0 })).toEqual({ ok: true });
  });

  test("reveal auf ein bereits aufgedecktes Feld wird abgelehnt (kein zweites Aufdecken)", () => {
    const positions = minePositions(SEED, 3);
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    state = applyMinesAction(state, "reveal", { cell: safeCell }, { seed: SEED });
    expect(checkMinesAction(state, "reveal", { cell: safeCell })).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("reveal außerhalb des Rasters (0..24) wird abgelehnt", () => {
    const state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    expect(checkMinesAction(state, "reveal", { cell: 25 })).toEqual({ ok: false, code: "INVALID_STAKE" });
    expect(checkMinesAction(state, "reveal", { cell: -1 })).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("cashOut ohne aufgedecktes Feld wird abgelehnt", () => {
    const state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    expect(checkMinesAction(state, "cashOut", {})).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("cashOut nach mindestens einem aufgedeckten Feld ist erlaubt", () => {
    const positions = minePositions(SEED, 3);
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    state = applyMinesAction(state, "reveal", { cell: safeCell }, { seed: SEED });
    expect(checkMinesAction(state, "cashOut", {})).toEqual({ ok: true });
  });

  test("jede Aktion auf einer bereits beendeten Runde wird abgelehnt", () => {
    const positions = minePositions(SEED, 3);
    const mineCell = positions[0]!;
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    state = applyMinesAction(state, "reveal", { cell: mineCell }, { seed: SEED });
    expect(state.status).toBe("hit");
    expect(checkMinesAction(state, "reveal", { cell: 0 })).toEqual({ ok: false, code: "INVALID_STAKE" });
    expect(checkMinesAction(state, "cashOut", {})).toEqual({ ok: false, code: "INVALID_STAKE" });
  });

  test("parseMinesPayload lehnt ein Payload ohne ganzzahlige cell ab", () => {
    expect(parseMinesPayload("reveal", { cell: "3" })).toEqual({ ok: false });
    expect(parseMinesPayload("reveal", {})).toEqual({ ok: false });
    expect(parseMinesPayload("reveal", { cell: 3.5 })).toEqual({ ok: false });
    expect(parseMinesPayload("reveal", { cell: 3 })).toEqual({ ok: true, value: { cell: 3 } });
    expect(parseMinesPayload("cashOut", {})).toEqual({ ok: true, value: {} });
  });
});

describe("mines-adapter — Anwenden und Abrechnen", () => {
  test("reveal auf eine Mine beendet die Runde mit Status 'hit'", () => {
    const positions = minePositions(SEED, 3);
    const mineCell = positions[0]!;
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    state = applyMinesAction(state, "reveal", { cell: mineCell }, { seed: SEED });
    expect(state.status).toBe("hit");
    expect(state.hitCell).toBe(mineCell);
    const settlement = settleMinesRound(state, 100);
    expect(settlement.returnMinor).toBe(0);
    expect(settlement.outcomeKey).toBe("mine");
  });

  test("cashOut nach k aufgedeckten Feldern zahlt exakt minesReturnMinor(stake, mines, k)", () => {
    const positions = minePositions(SEED, 3);
    const safeCells = [...Array(25).keys()].filter((c) => !positions.includes(c)).slice(0, 2);
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 500, betKey: "m3" });
    for (const cell of safeCells) state = applyMinesAction(state, "reveal", { cell }, { seed: SEED });
    state = applyMinesAction(state, "cashOut", {}, { seed: SEED });
    expect(state.status).toBe("cashedOut");
    const settlement = settleMinesRound(state, 500);
    expect(settlement.returnMinor).toBe(minesReturnMinor(500, 3, 2));
    expect(settlement.returnMinor).toBeGreaterThan(0);
  });

  test("werden alle sicheren Felder aufgedeckt, endet die Runde automatisch mit Status 'cleared'", () => {
    const mines = 5;
    const positions = minePositions(SEED, mines);
    const safeCells = [...Array(25).keys()].filter((c) => !positions.includes(c));
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 200, betKey: "m5" });
    for (const cell of safeCells) state = applyMinesAction(state, "reveal", { cell }, { seed: SEED });
    expect(state.status).toBe("cleared");
    const settlement = settleMinesRound(state, 200);
    expect(settlement.returnMinor).toBe(minesReturnMinor(200, mines, safeCells.length));
  });

  test("Rückgabe ist nie negativ und immer ganzzahlig", () => {
    const positions = minePositions(SEED, 1);
    const mineCell = positions[0]!;
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 333, betKey: "m1" });
    state = applyMinesAction(state, "reveal", { cell: mineCell }, { seed: SEED });
    const settlement = settleMinesRound(state, 333);
    expect(Number.isInteger(settlement.returnMinor)).toBe(true);
    expect(settlement.returnMinor).toBeGreaterThanOrEqual(0);
  });
});

describe("mines-adapter — Sichtbarkeitsgrenze (Kern dieser Phase)", () => {
  test("publicView() einer offenen Runde enthält KEINE Minenpositionen und KEIN hitCell-Feld", () => {
    const positions = minePositions(SEED, 3);
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    state = applyMinesAction(state, "reveal", { cell: safeCell }, { seed: SEED });
    const view = minesPublicView(state, false, { seed: SEED });
    // Präzise Prüfung auf Objektebene statt String-Heuristik (Zahlen wie "multiplier" oder
    // "cellsRemaining" enthalten unvermeidlich Ziffern, die mit Feldindizes kollidieren können —
    // eine Zeichenketten-Suche wäre hier keine verlässliche Sicherheitsprüfung).
    expect(Object.keys(view).sort()).toEqual(["cellsRemaining", "mines", "multiplier", "revealedCells", "revealedCount", "status"]);
    expect(view).not.toHaveProperty("positions");
    expect(view).not.toHaveProperty("hitCell");
    expect(positions.length).toBeGreaterThan(0); // Kontrolle: es gäbe tatsächlich etwas zu verstecken.
    expect(view.revealedCells).toEqual([safeCell]);
    expect(view.multiplier).toBe(minesMultiplier(3, 1));
  });

  test("publicView() einer beendeten Runde (Treffer) zeigt jetzt alle Minenpositionen", () => {
    const positions = minePositions(SEED, 3);
    const mineCell = positions[0]!;
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    state = applyMinesAction(state, "reveal", { cell: mineCell }, { seed: SEED });
    const view = minesPublicView(state, true, { seed: SEED });
    expect(view.positions).toEqual(positions);
    expect(view.hitCell).toBe(mineCell);
  });

  test("publicView() nach cashOut zeigt ebenfalls alle Minenpositionen (Runde ist vorbei)", () => {
    const positions = minePositions(SEED, 3);
    const safeCell = [...Array(25).keys()].find((c) => !positions.includes(c))!;
    let state = startMinesRoundState({ seed: SEED, stakeMinor: 100, betKey: "m3" });
    state = applyMinesAction(state, "reveal", { cell: safeCell }, { seed: SEED });
    state = applyMinesAction(state, "cashOut", {}, { seed: SEED });
    const view = minesPublicView(state, true, { seed: SEED });
    expect(view.positions).toEqual(positions);
  });
});
