import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { getSession } from "@/server/auth/guards";
import { loadResponsibleGaming } from "@/server/rg/rg-guard";
import { nowIso } from "@/lib/ids";
import type { ResponsibleGaming } from "@/types/responsible-gaming";
import { DEFAULT_REMINDER_INTERVAL_MINUTES } from "@/lib/constants";

/**
 * Heartbeat der laufenden Sitzung (Auftrag §4): `state/RgContext.tsx` ruft dies periodisch auf,
 * während der Tab sichtbar ist — dasselbe Muster wie der frühere clientseitige `TOUCH`-Dispatch
 * (state/rg-reducer.ts, vor dieser Umstellung), nur jetzt serverseitig gegen `play_session`
 * geschrieben. Ein bloßer Seitenaufruf ohne diesen Heartbeat verlängert NICHTS (siehe
 * server/rg/rg-read-model.ts) — erst dieser Endpunkt (oder ein Rundenstart) zählt als Aktivität.
 *
 * `runtime = "nodejs"`: derselbe Grund wie bei den Rundenendpunkten — der `pg`-Treiber ist nicht
 * Edge-fähig.
 */
export const runtime = "nodejs";

type TouchResponse = { success: true; data: { rg: ResponsibleGaming } };

function defaultResponsibleGaming(): ResponsibleGaming {
  return { sessionStartedAt: nowIso(), reminderIntervalMinutes: DEFAULT_REMINDER_INTERVAL_MINUTES, selfExcluded: false };
}

export async function POST(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    // Kein Konto anlegen für einen bloßen Heartbeat ohne jede sonstige Interaktion — dasselbe
    // Prinzip wie server/rg/rg-read-model.ts: nur echte Aktionen (Rundenstart, RG-Einstellung)
    // legen ein Gastkonto an (app/api/rounds/start/route.ts, app/api/rg/settings/route.ts).
    return NextResponse.json<TouchResponse>({ success: true, data: { rg: defaultResponsibleGaming() } });
  }
  const rg = await loadResponsibleGaming(db, session.user.id, nowIso());
  return NextResponse.json<TouchResponse>({ success: true, data: { rg } });
}
