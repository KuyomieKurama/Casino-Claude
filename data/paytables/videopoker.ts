import type { Paytable } from "@/types/game-round";

/**
 * Video Poker („Jacks or Better“, g-video-poker) führt BEWUSST keine Auszahlungstabelle.
 *
 * Grund (Regel 6): Der Erwartungswert einer Runde hängt davon ab, welche Karten die spielende
 * Person behält. Ein einzelner RTP-Wert ließe sich nur unter Annahme einer bestimmten Spielweise
 * angeben — das wäre eine Strategieaussage, keine Eigenschaft des Spiels. Ohne verifizierte
 * Tabelle wird deshalb kein RTP ausgewiesen; `data/catalog.ts` lässt `rtpDemo` entsprechend leer.
 *
 * Die GEWINNTABELLE (Hand → Multiplikator) ist etwas anderes als eine Wahrscheinlichkeitstabelle.
 * Sie ist fest, vollständig getestet und in der Oberfläche sichtbar; sie steht in
 * `components/game/engine/videopoker/videopoker-logic.ts` als `PAYTABLE`.
 */
export const videoPokerPaytables: readonly Paytable[] = [];
