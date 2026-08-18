import type { AppDatabase } from "@/server/db/types";
import type { ResponsibleGaming } from "@/types/responsible-gaming";
import { getRgStatus, type RgStatus } from "@/lib/responsible-gaming";
import { checkRgNotBlocked, type WalletRejectionCode } from "@/lib/wallet-policy";
import { findOrCreateRgSettings } from "@/server/repositories/rg-settings-repository";
import { touchPlaySession } from "@/server/repositories/play-session-repository";
import { composeResponsibleGaming } from "./compose";

/**
 * Der eigentliche Kern dieses Auftrags: serverseitige Durchsetzung von Selbstsperre, Pause und
 * Zeitlimit. MUSS innerhalb derselben Datenbanktransaktion aufgerufen werden wie die
 * nachfolgende Buchung (`db` ist dort immer `tx`, nie der Top-Level-Client) — die Prüfung läuft
 * damit gegen den committeten Datenbankstand, nicht gegen einen vom Client gelieferten Wert.
 *
 * Keine stillen Fallbacks: Schlagen die darunterliegenden Repository-Aufrufe fehl (z. B. eine
 * DB-Verbindung bricht ab), wirft diese Funktion — dasselbe Verhalten wie jeder andere
 * Repository-Fehler in server/rounds/*.ts. Es gibt keinen Codepfad, der einen Fehler beim Laden
 * der RG-Einstellungen in „erlaubt" auflöst. Eine Schutzfunktion, die im Fehlerfall öffnet, ist
 * keine Schutzfunktion.
 */

/**
 * Baut dasselbe `ResponsibleGaming`-Objekt, das früher ausschließlich clientseitig existierte
 * (state/rg-reducer.ts), aus `rg_setting` (Einstellungen) und der aktiven `play_session`
 * (Sitzungsbeginn, letzte Erinnerung) zusammen. `touchPlaySession` schreibt dabei Aktivität fort
 * bzw. beginnt nach einer Lücke von mehr als `SESSION_GAP_MS` eine neue Sitzung (Auftrag §4) —
 * jeder Aufruf hier ZÄHLT als Aktivität, unabhängig vom späteren Blockierungsergebnis.
 */
export async function loadResponsibleGaming(db: AppDatabase, userId: string, nowIso: string): Promise<ResponsibleGaming> {
  const [settings, session] = await Promise.all([findOrCreateRgSettings(db, userId), touchPlaySession(db, userId, nowIso)]);
  return composeResponsibleGaming(settings, session, nowIso);
}

export type RgGuardResult = { ok: true; status: RgStatus } | { ok: false; code: Extract<WalletRejectionCode, "RG_BLOCKED"> };

/**
 * Lehnt ab (`RG_BLOCKED`), wenn Selbstsperre, Pause oder Zeitlimit aktiv sind — sonst `ok: true`
 * mit dem berechneten Status. Aufrufer aus `server/rounds/*.ts` prüfen NUR `.ok`; der konkrete
 * Grund (`status.reason`, geprüft in server/rg/rg-guard.test.ts) bleibt intern, weil die
 * bestehende Wire-Antwort (`WalletRejectionCode`) keinen zusätzlichen Grund kennt — dieselbe
 * Meldung wie bisher ("RG_BLOCKED"), nur jetzt aus dem tatsächlichen Datenbankstand berechnet
 * statt vom Client behauptet.
 */
export async function assertRgNotBlocked(db: AppDatabase, userId: string, nowIso: string): Promise<RgGuardResult> {
  const rg = await loadResponsibleGaming(db, userId, nowIso);
  const status = getRgStatus(rg, Date.parse(nowIso));
  const check = checkRgNotBlocked(status.blocked);
  if (!check.ok) return { ok: false, code: check.code as "RG_BLOCKED" };
  return { ok: true, status };
}
