import type { SoundName } from "./useEngineSound";

/**
 * Ordnet den Rundenabschluss-Ton nach der Netto-Regel zu (ENGINE-BRIEF.md, verbotene Dark
 * Patterns: „Loss Disguised as Win"). GameShell.tsx zeigt bereits ausschließlich `netMinor`
 * (Rückgabe − Einsatz) als Ergebnis an — dieselbe Größe entscheidet hier über den Ton, damit nie
 * zwei verschiedene Kriterien für „gewonnen" im Code existieren.
 *
 *   netMinor > 0   → echter Netto-Gewinn                          → "win"
 *   netMinor <= 0  → Verlust ODER Push (Einsatz zurück, netto 0)  → "settle"
 *
 * Ein Push (z. B. Blackjack-Gleichstand, Baccarat-Unentschieden bei Spieler-/Bankwette) gibt
 * genau den Einsatz zurück — netMinor ist dann 0, also kein Netto-Gewinn und damit "settle",
 * nicht "win".
 */
export function roundSettleSound(netMinor: number): Extract<SoundName, "win" | "settle"> {
  return netMinor > 0 ? "win" : "settle";
}
