import { describe, expect, it } from "vitest";
import type { ResponsibleGaming } from "@/types/responsible-gaming";
import { getRgStatus, SESSION_GAP_MS } from "./responsible-gaming";

/**
 * Diese Aussagen standen früher in state/rg-reducer.test.ts und liefen über den inzwischen
 * entfernten lokalen Reducer (rgReducer). Mit der Umstellung auf serverseitige Durchsetzung
 * (Auftrag „Server statt Client") entstehen `ResponsibleGaming`-Werte nicht mehr aus
 * Reducer-Aktionen, sondern aus `rg_setting` + `play_session` (server/rg/rg-guard.ts) bzw. hier
 * direkt aus Literalen — dieselben Aussagen, derselbe Prüfling (`getRgStatus`), nur ohne den
 * entfallenen Zwischenschritt. Die frühere „Hydration übersteht Reload, nach langer Abwesenheit
 * neue Sitzung"-Aussage hat ihr serverseitiges Gegenstück in
 * server/repositories/play-session-repository.test.ts (`touchPlaySession`).
 */

const t0 = "2026-08-15T10:00:00.000Z";
const ms = (iso: string) => Date.parse(iso);
const plus = (iso: string, minutes: number) => new Date(ms(iso) + minutes * 60_000).toISOString();

function baseRg(overrides: Partial<ResponsibleGaming> = {}): ResponsibleGaming {
  return { sessionStartedAt: t0, reminderIntervalMinutes: 30, selfExcluded: false, ...overrides };
}

describe("getRgStatus", () => {
  it("Selbstsperre blockiert bis zur ausdrücklichen Aufhebung", () => {
    const notExcluded = baseRg();
    expect(getRgStatus(notExcluded, ms(t0)).blocked).toBe(false);

    const excluded = baseRg({ selfExcluded: true });
    expect(getRgStatus(excluded, ms(t0))).toMatchObject({ blocked: true, reason: "self-excluded" });
    // Zeit allein hebt nichts auf.
    expect(getRgStatus(excluded, ms(plus(t0, 60 * 24 * 30))).blocked).toBe(true);

    const lifted = baseRg({ selfExcluded: false });
    expect(getRgStatus(lifted, ms(t0)).blocked).toBe(false);
  });

  it("Pause blockiert bis pausedUntil, danach automatisch frei", () => {
    const pausedUntil = plus(t0, 15);
    const paused = baseRg({ pausedUntil });
    expect(getRgStatus(paused, ms(plus(t0, 14))).reason).toBe("paused");
    expect(getRgStatus(paused, ms(plus(t0, 15))).blocked).toBe(false);

    const ended = baseRg(); // END_PAUSE-Äquivalent: pausedUntil entfernt
    expect(getRgStatus(ended, ms(plus(t0, 2))).blocked).toBe(false);
  });

  it("Zeitlimit wird aus Zeitstempeln berechnet, nicht aus Zählern", () => {
    const limited = baseRg({ sessionLimitMinutes: 30 });
    const before = getRgStatus(limited, ms(plus(t0, 29)));
    expect(before.blocked).toBe(false);
    expect(before.sessionRemainingMs).toBe(60_000);
    const after = getRgStatus(limited, ms(plus(t0, 30)));
    expect(after).toMatchObject({ blocked: true, reason: "limit-reached", sessionRemainingMs: 0 });

    // START_NEW_SESSION-Äquivalent: neue sessionStartedAt setzt die Uhr zurück.
    const newSession = baseRg({ sessionLimitMinutes: 30, sessionStartedAt: plus(t0, 31) });
    expect(getRgStatus(newSession, ms(plus(t0, 31))).blocked).toBe(false);

    const unlimited = baseRg({ sessionStartedAt: plus(t0, 31) });
    expect(getRgStatus(unlimited, ms(plus(t0, 500))).blocked).toBe(false);
  });

  it("Erinnerung wird nach dem Intervall fällig und nach dem Anzeigen zurückgesetzt", () => {
    const withInterval = baseRg({ reminderIntervalMinutes: 30 });
    expect(getRgStatus(withInterval, ms(plus(t0, 29))).reminderDue).toBe(false);
    expect(getRgStatus(withInterval, ms(plus(t0, 30))).reminderDue).toBe(true);

    const afterShown = baseRg({ reminderIntervalMinutes: 30, lastReminderAt: plus(t0, 30) });
    expect(getRgStatus(afterShown, ms(plus(t0, 45))).reminderDue).toBe(false);
    expect(getRgStatus(afterShown, ms(plus(t0, 60))).reminderDue).toBe(true);
  });

  it("SESSION_GAP_MS beträgt 30 Minuten (Grundlage der serverseitigen Sitzungslücken-Erkennung)", () => {
    expect(SESSION_GAP_MS).toBe(30 * 60_000);
  });
});
