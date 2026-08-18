import type { ResponsibleGaming } from "@/types/responsible-gaming";
import type { RgSettingsRecord } from "@/server/repositories/rg-settings-repository";
import { DEFAULT_REMINDER_INTERVAL_MINUTES } from "@/lib/constants";

/**
 * Baut ein `ResponsibleGaming`-Objekt (dieselbe Form, die früher ausschließlich clientseitig
 * existierte, state/rg-reducer.ts) aus `rg_setting` und der aktiven `play_session` zusammen —
 * EINE Stelle für diese Zusammensetzung, wiederverwendet von `rg-guard.ts` (Durchsetzung),
 * `rg-read-model.ts` (SSR-Anfangswert) und `rg-settings-service.ts` (Antwort nach einer
 * Änderung), statt sie dreimal zu duplizieren.
 *
 * `settings`/`session` dürfen `null` sein (noch keine Zeile angelegt, z. B. beim reinen Lesen
 * durch `rg-read-model.ts` ohne Touch) — dann gelten dieselben Standardwerte wie für einen
 * brandneuen Nutzer: keine Sperre, kein Limit, Standard-Erinnerungsintervall, Sitzung „jetzt".
 */
export function composeResponsibleGaming(
  settings: RgSettingsRecord | null,
  session: { startedAt: string; lastReminderAt: string | null } | null,
  nowIso: string,
): ResponsibleGaming {
  return {
    sessionStartedAt: session?.startedAt ?? nowIso,
    reminderIntervalMinutes: settings?.reminderIntervalMinutes ?? DEFAULT_REMINDER_INTERVAL_MINUTES,
    selfExcluded: settings?.selfExcluded ?? false,
    ...(settings?.sessionLimitMinutes != null ? { sessionLimitMinutes: settings.sessionLimitMinutes } : {}),
    ...(settings?.pausedUntil != null ? { pausedUntil: settings.pausedUntil } : {}),
    ...(session?.lastReminderAt != null ? { lastReminderAt: session.lastReminderAt } : {}),
  };
}
