/**
 * Re-Export der reinen Responsible-Gaming-Regeln aus `lib/responsible-gaming.ts`.
 *
 * Diese Datei enthielt bis zur Umstellung auf serverseitige Durchsetzung (Auftrag „Server statt
 * Client") zusätzlich einen eigenen React-Reducer (`rgReducer`) samt LocalStorage-Persistierung
 * (`toPersistedRg`/`parseRg`) — Selbstsperre, Pause und Zeitlimit lebten dort ausschließlich
 * clientseitig. Diesen lokalen Zustand gibt es nicht mehr: `state/RgContext.tsx` bezieht `rg`
 * jetzt vom Server (`server/rg/**`, `app/api/rg/**`), der allein über Blockierung entscheidet.
 * Die reine Auswertungsfunktion `getRgStatus` bleibt unverändert erhalten, nur der Ort hat sich
 * geändert (`server/**` darf laut Schichtregel nichts aus `state/**` importieren, `lib/**` aber
 * von beiden Seiten genutzt werden) — dieser Re-Export hält bestehende Importe aus
 * `components/game/GameDetail.tsx`, `components/game/engine/GameShell.tsx`, `components/rg/RgPanel.tsx`
 * und `components/user/Dashboard.tsx` unverändert funktionsfähig.
 */
export { getRgStatus, rgReasonText, SESSION_GAP_MS } from "@/lib/responsible-gaming";
export type { RgBlockReason, RgStatus } from "@/lib/responsible-gaming";
