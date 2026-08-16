import { describe, expect, it } from "vitest";
import { createInitialRgState, getRgStatus, rgReducer, toPersistedRg, SESSION_GAP_MS } from "./rg-reducer";

const t0 = "2026-08-15T10:00:00.000Z";
const ms = (iso: string) => Date.parse(iso);
const plus = (iso: string, minutes: number) => new Date(ms(iso) + minutes * 60_000).toISOString();

describe("Responsible Gaming", () => {
  it("Selbstsperre blockiert bis zur ausdrücklichen Aufhebung", () => {
    let s = { ...createInitialRgState(t0), hydrated: true };
    expect(getRgStatus(s.rg, ms(t0)).blocked).toBe(false);
    s = rgReducer(s, { type: "SELF_EXCLUDE", now: t0 });
    expect(getRgStatus(s.rg, ms(t0))).toMatchObject({ blocked: true, reason: "self-excluded" });
    // Zeit allein hebt nichts auf
    expect(getRgStatus(s.rg, ms(plus(t0, 60 * 24 * 30))).blocked).toBe(true);
    s = rgReducer(s, { type: "LIFT_SELF_EXCLUSION", now: t0 });
    expect(getRgStatus(s.rg, ms(t0)).blocked).toBe(false);
  });

  it("Pause blockiert bis pausedUntil, danach automatisch frei; vorzeitiges Ende nur explizit", () => {
    let s = { ...createInitialRgState(t0), hydrated: true };
    s = rgReducer(s, { type: "PAUSE", minutes: 15, now: t0 });
    expect(getRgStatus(s.rg, ms(plus(t0, 14))).reason).toBe("paused");
    expect(getRgStatus(s.rg, ms(plus(t0, 15))).blocked).toBe(false);
    s = rgReducer(s, { type: "END_PAUSE", now: plus(t0, 1) });
    expect(getRgStatus(s.rg, ms(plus(t0, 2))).blocked).toBe(false);
  });

  it("Zeitlimit wird aus Zeitstempeln berechnet, nicht aus Zählern", () => {
    let s = { ...createInitialRgState(t0), hydrated: true };
    s = rgReducer(s, { type: "SET_SESSION_LIMIT", minutes: 30 });
    const before = getRgStatus(s.rg, ms(plus(t0, 29)));
    expect(before.blocked).toBe(false);
    expect(before.sessionRemainingMs).toBe(60_000);
    const after = getRgStatus(s.rg, ms(plus(t0, 30)));
    expect(after).toMatchObject({ blocked: true, reason: "limit-reached", sessionRemainingMs: 0 });
    s = rgReducer(s, { type: "START_NEW_SESSION", now: plus(t0, 31) });
    expect(getRgStatus(s.rg, ms(plus(t0, 31))).blocked).toBe(false);
    s = rgReducer(s, { type: "SET_SESSION_LIMIT", minutes: undefined });
    expect(getRgStatus(s.rg, ms(plus(t0, 500))).blocked).toBe(false);
  });

  it("Erinnerung wird nach dem Intervall fällig und nach dem Anzeigen zurückgesetzt", () => {
    let s = { ...createInitialRgState(t0), hydrated: true };
    s = rgReducer(s, { type: "SET_REMINDER_INTERVAL", minutes: 30 });
    expect(getRgStatus(s.rg, ms(plus(t0, 29))).reminderDue).toBe(false);
    expect(getRgStatus(s.rg, ms(plus(t0, 30))).reminderDue).toBe(true);
    s = rgReducer(s, { type: "MARK_REMINDER_SHOWN", now: plus(t0, 30) });
    expect(getRgStatus(s.rg, ms(plus(t0, 45))).reminderDue).toBe(false);
    expect(getRgStatus(s.rg, ms(plus(t0, 60))).reminderDue).toBe(true);
  });

  it("Hydration: Sperre und Pause überleben den Reload; nach langer Abwesenheit beginnt eine neue Sitzung", () => {
    let s = { ...createInitialRgState(t0), hydrated: true };
    s = rgReducer(s, { type: "SELF_EXCLUDE", now: t0 });
    const persisted = JSON.parse(JSON.stringify(toPersistedRg(s)));
    const soon = plus(t0, 5);
    const r1 = rgReducer(createInitialRgState(soon), { type: "HYDRATE", slice: persisted, now: soon });
    expect(r1.rg.selfExcluded).toBe(true);
    expect(r1.rg.sessionStartedAt).toBe(t0);
    const late = new Date(ms(t0) + SESSION_GAP_MS + 60_000).toISOString();
    const r2 = rgReducer(createInitialRgState(late), { type: "HYDRATE", slice: persisted, now: late });
    expect(r2.rg.selfExcluded).toBe(true);
    expect(r2.rg.sessionStartedAt).toBe(late);
    const bad = rgReducer(createInitialRgState(t0), { type: "HYDRATE", slice: { rg: 42 }, now: t0 });
    expect(bad.hydrated).toBe(true);
    expect(bad.rg.selfExcluded).toBe(false);
  });
});
