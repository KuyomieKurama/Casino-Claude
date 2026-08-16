import type { Paytable, PaytableEntry } from "@/types/game-round";
import { buildPaytable } from "@/lib/paytable";

/**
 * Auszahlungstabellen der Slots. Der Erwartungswert jeder Tabelle IST der ausgewiesene
 * rtpDemo des Spiels (Regel 6) — geprüft durch lib/rng.test.ts und
 * components/game/slot/slots-logic.test.ts über 5.000.000 simulierte Runden je Tabelle.
 *
 * Alle Wahrscheinlichkeiten sind Vielfache von 0,0001 und nachgerechnet. `buildPaytable` prüft
 * beim Laden des Moduls, dass jede Tabelle exakt auf 1 summiert — ein Datenfehler fällt damit
 * sofort auf und nicht erst im Test.
 *
 * Alle Tabellen benutzen dieselben acht Ergebnisklassen (none … top), damit Darstellung
 * (components/game/slot/symbols.ts) und Tabelle je Spiel eindeutig zusammenpassen.
 *
 * Die Form der Tabelle folgt der `volatility` aus data/games.ts:
 *  - low    → viele kleine Rückgaben, kurze Nullserien, Höchstmultiplikator ≤ 50×
 *  - medium → Referenzform von Neon Nights, Höchstmultiplikator 100×
 *  - high   → deutlich höhere Nullrundenwahrscheinlichkeit, dafür 400× bis 500× an der Spitze
 *
 * Kein Dark Pattern (Regel 7): Die Klassen „partial“ (0,5×) und „push“ (1×) sind Rückgaben
 * unter oder auf Einsatzhöhe. Sie werden in der Oberfläche nie als Gewinn gefeiert — angezeigt
 * wird ausschließlich die Nettoveränderung.
 */

/** Kleiner Konstruktor, damit jede Tabelle dieselbe Form hat und beim Laden geprüft wird. */
const table = (gameId: string, entries: PaytableEntry[]): Paytable => buildPaytable(gameId, entries);

/** Classic Fruit — low: dichte kleine Rückgaben, Spitze 40×. Demo-RTP 96,0 %. */
const classicFruit = table("g-classic-fruit", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.3622 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.26 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.198 },
  { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.11 },
  { key: "hit", label: "Treffer", multiplier: 4, probability: 0.05 },
  { key: "big", label: "Großer Treffer", multiplier: 8, probability: 0.015 },
  { key: "streak", label: "Serie", multiplier: 15, probability: 0.004 },
  { key: "top", label: "Höchstgewinn", multiplier: 40, probability: 0.0008 },
]);

/**
 * Neon Nights — Referenztabelle aus §6 des Prompts, Demo-RTP 95,0 %.
 * Diese Tabelle bleibt unverändert; alle anderen sind an ihr ausgerichtet.
 */
const neonNights = table("g-neon-nights", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.505 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.2 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.15 },
  { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.09 },
  { key: "hit", label: "Treffer", multiplier: 5, probability: 0.036 },
  { key: "big", label: "Großer Treffer", multiplier: 10, probability: 0.014 },
  { key: "streak", label: "Serie", multiplier: 25, probability: 0.004 },
  { key: "top", label: "Höchstgewinn", multiplier: 100, probability: 0.001 },
]);

/** Kupferschacht — high: knapp zwei Drittel Nullrunden, Spitze 500×. Demo-RTP 94,5 %. */
const kupferschacht = table("g-kupferschacht", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.6376 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.15 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.1 },
  { key: "small", label: "Kleiner Treffer", multiplier: 3, probability: 0.08 },
  { key: "hit", label: "Treffer", multiplier: 8, probability: 0.025 },
  { key: "big", label: "Großer Treffer", multiplier: 25, probability: 0.006 },
  { key: "streak", label: "Serie", multiplier: 100, probability: 0.0013 },
  { key: "top", label: "Höchstgewinn", multiplier: 500, probability: 0.0001 },
]);

/** Codex Aurelia — high: seltene, dafür große Treffer, Spitze 500×. Demo-RTP 96,0 %. */
const codexAurelia = table("g-codex-aurelia", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.5939 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.16 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.12 },
  { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.08 },
  { key: "hit", label: "Treffer", multiplier: 6, probability: 0.035 },
  { key: "big", label: "Großer Treffer", multiplier: 20, probability: 0.009 },
  { key: "streak", label: "Serie", multiplier: 80, probability: 0.002 },
  { key: "top", label: "Höchstgewinn", multiplier: 500, probability: 0.0001 },
]);

/** Salzwind — medium, ruhiger als Neon Nights. Demo-RTP 94,5 %. */
const salzwind = table("g-salzwind", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.5073 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.2 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.148 },
  { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.09 },
  { key: "hit", label: "Treffer", multiplier: 5, probability: 0.036 },
  { key: "big", label: "Großer Treffer", multiplier: 10, probability: 0.0137 },
  { key: "streak", label: "Serie", multiplier: 25, probability: 0.004 },
  { key: "top", label: "Höchstgewinn", multiplier: 100, probability: 0.001 },
]);

/** Sandkönigin — medium. Demo-RTP 95,5 %. */
const sandkoenigin = table("g-sandkoenigin", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.501 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.21 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.14 },
  { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.095 },
  { key: "hit", label: "Treffer", multiplier: 5, probability: 0.034 },
  { key: "big", label: "Großer Treffer", multiplier: 10, probability: 0.015 },
  { key: "streak", label: "Serie", multiplier: 25, probability: 0.004 },
  { key: "top", label: "Höchstgewinn", multiplier: 100, probability: 0.001 },
]);

/** Mystic Jungle — high: höchste Nullrundenquote im Katalog, Spitze 400×. Demo-RTP 94,0 %. */
const mysticJungle = table("g-mystic-jungle", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.6488 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.15 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.105 },
  { key: "small", label: "Kleiner Treffer", multiplier: 3, probability: 0.07 },
  { key: "hit", label: "Treffer", multiplier: 10, probability: 0.02 },
  { key: "big", label: "Großer Treffer", multiplier: 30, probability: 0.005 },
  { key: "streak", label: "Serie", multiplier: 120, probability: 0.001 },
  { key: "top", label: "Höchstgewinn", multiplier: 400, probability: 0.0002 },
]);

/** Luxury 7s — low: flachste Kurve, Spitze 49×. Demo-RTP 95,5 %. */
const luxury7s = table("g-luxury-7s", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.3615 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.27 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.19 },
  { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.1035 },
  { key: "hit", label: "Treffer", multiplier: 3, probability: 0.05 },
  { key: "big", label: "Großer Treffer", multiplier: 7, probability: 0.02 },
  { key: "streak", label: "Serie", multiplier: 21, probability: 0.004 },
  { key: "top", label: "Höchstgewinn", multiplier: 49, probability: 0.001 },
]);

/**
 * Staubpfad — medium. Das Spiel steht in data/games.ts auf `status: "inactive"`; die Detailseite
 * blockiert den Start. Die Tabelle liegt trotzdem vor, damit der ausgewiesene RTP auch für ein
 * abgeschaltetes Spiel belegt ist und nach dem Aktivieren nichts nachgezogen werden muss.
 * Demo-RTP 94,0 %.
 */
const staubpfad = table("g-staubpfad", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.5137 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.2 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.15 },
  { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.085 },
  { key: "hit", label: "Treffer", multiplier: 5, probability: 0.034 },
  { key: "big", label: "Großer Treffer", multiplier: 10, probability: 0.012 },
  { key: "streak", label: "Serie", multiplier: 25, probability: 0.004 },
  { key: "top", label: "Höchstgewinn", multiplier: 100, probability: 0.0013 },
]);

/** Zunderschuppe — high: wenige, dafür deutliche Ereignisse, Spitze 500×. Demo-RTP 96,5 %. */
const zunderschuppe = table("g-zunderschuppe", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.6417 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.15 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.11 },
  { key: "small", label: "Kleiner Treffer", multiplier: 3, probability: 0.07 },
  { key: "hit", label: "Treffer", multiplier: 10, probability: 0.022 },
  { key: "big", label: "Großer Treffer", multiplier: 30, probability: 0.005 },
  { key: "streak", label: "Serie", multiplier: 125, probability: 0.0012 },
  { key: "top", label: "Höchstgewinn", multiplier: 500, probability: 0.0001 },
]);

/** Lunara Drift — medium, etwas mehr Teilrückgaben als Neon Nights. Demo-RTP 96,0 %. */
const lunaraDrift = table("g-lunara-drift", [
  { key: "none", label: "Nullrunde", multiplier: 0, probability: 0.485 },
  { key: "partial", label: "Teilrückgabe", multiplier: 0.5, probability: 0.22 },
  { key: "push", label: "Einsatz zurück", multiplier: 1, probability: 0.15 },
  { key: "small", label: "Kleiner Treffer", multiplier: 2, probability: 0.09 },
  { key: "hit", label: "Treffer", multiplier: 5, probability: 0.036 },
  { key: "big", label: "Großer Treffer", multiplier: 10, probability: 0.014 },
  { key: "streak", label: "Serie", multiplier: 25, probability: 0.004 },
  { key: "top", label: "Höchstgewinn", multiplier: 100, probability: 0.001 },
]);

export const slotPaytables: readonly Paytable[] = [
  classicFruit,
  neonNights,
  kupferschacht,
  codexAurelia,
  salzwind,
  sandkoenigin,
  mysticJungle,
  luxury7s,
  staubpfad,
  zunderschuppe,
  lunaraDrift,
];
