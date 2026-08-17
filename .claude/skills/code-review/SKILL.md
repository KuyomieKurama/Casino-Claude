---
name: code-review
description: Review von Velora-Code-Änderungen (Diff oder konkrete Dateien). Einsetzen vor dem Mergen, nach größeren Änderungen oder auf Wunsch. Fokus auf echte Fehler, nicht Stil.
---

# Skill: code-review

## Vorgehen
1. Geänderten Umfang erfassen (`git diff` bzw. genannte Dateien).
2. Gegen `CLAUDE.md`, `ENGINE-BRIEF.md` und Schichtregeln prüfen.
3. Funde nach Schweregrad ordnen — **echte Fehler vor Stil**.

## Prüfdimensionen (Velora-spezifisch)
- **Geld & RNG:** `CreditsMinor` nur ganzzahlig, Formatierung nur via `formatCredits*()`, kein `Math.random()` in Spiellogik, nur `mulberry32`.
- **RTP-Konformität:** Paytable summiert auf 1, RTP in `data/catalog.ts` berechnet (nicht von Hand), kein hardcodierter Wert in `data/games.ts`.
- **Schichtregeln:** `lib/**` importiert nicht aus `components|app|state`; `data/**` nur aus `types/` + gezielt `lib/paytable|lib/rng`; `components/ui/**` nicht aus `state|data`.
- **Dark Patterns:** kein Autoplay, kein Turbospin, kein betont animierter Near Miss, kein Loss Disguised as Win, kein Ton, kein vorausgewählter Bonus.
- **Engine-Architektur:** View-Signatur `GameEngineViewProps`, `useRound`-Nutzung, `GameShell`-Integration, Registry-Eintrag vorhanden.
- **Lesbarkeit:** Namensgebung, Komponentengröße (<50 Zeilen), Wiederverwendung von `components/ui`.
- **Tests:** Unit + Komponenten, RTP-Treffer-Test für Engines, keine fehlenden Abdeckungen.

## Ausgabe
- Gruppiert nach **Blocker / Wichtig / Optional**. Je Fund: `Datei:Zeile`, Problem, konkreter
  Fix-Vorschlag, ggf. Testidee. Positive Punkte kurz nennen.
- Empfehle abschließend `npm run typecheck && npm run lint && npm test`.

## Regeln
- Keine erfundenen Probleme; Unsicheres als `Zu verifizieren` markieren.
- Anwendungscode nicht ungefragt ändern — Review liefert Befunde, keine stillen Edits.
