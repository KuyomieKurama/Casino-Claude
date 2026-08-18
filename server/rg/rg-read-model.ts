import type { AppDatabase } from "@/server/db/types";
import type { ResponsibleGaming } from "@/types/responsible-gaming";
import { findRgSettings } from "@/server/repositories/rg-settings-repository";
import { findActiveSession } from "@/server/repositories/play-session-repository";
import { composeResponsibleGaming } from "./compose";

/**
 * Lesepfad für den anfänglichen RG-Zustand (app/layout.tsx), analog zu
 * server/wallet/wallet-read-model.ts: reine Funktion mit `db`/`userId` als Parameter, kein
 * eigener Verbindungsaufbau. Bewusst NUR lesend — anders als `server/rg/rg-guard.ts`
 * (`assertRgNotBlocked`, aufgerufen aus den Rundenendpunkten) wird hier WEDER eine Sitzung
 * berührt/verlängert NOCH eine `rg_setting`-Zeile angelegt: ein bloßer Seitenaufruf ohne echte
 * Interaktion (Rundenstart, RG-Einstellungsänderung, Heartbeat über `POST /api/rg/touch`) soll
 * keine Sitzung beginnen oder eine bestehende stillschweigend verlängern.
 *
 * Aufrufer MÜSSEN `userId` aus der geprüften Sitzung (server/auth/guards.ts::getSession()) oder
 * `null` übergeben — niemals aus einem Client-Wert.
 */
export async function resolveResponsibleGaming(db: AppDatabase, userId: string | null): Promise<ResponsibleGaming> {
  const nowIso = new Date().toISOString();
  if (userId === null) return composeResponsibleGaming(null, null, nowIso);

  const [settings, session] = await Promise.all([findRgSettings(db, userId), findActiveSession(db, userId)]);
  return composeResponsibleGaming(settings, session, nowIso);
}
