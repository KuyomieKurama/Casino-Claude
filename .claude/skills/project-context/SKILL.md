---
name: project-context
description: Vor größeren oder bereichsübergreifenden Aufgaben in Velora Casino Demo — verschafft schnelles, korrektes Projektverständnis. Einsetzen, wenn unklar ist, wie Module zusammenhängen, welche Architekturregeln gelten oder wo etwas implementiert ist (z. B. neue Engine, Refactorings, Bugfixes über mehrere Schichten).
---

# Skill: project-context

Zweck: zuverlässiges Verständnis von Velora Casino Demo aufbauen, **ohne Details zu erfinden**.

## Schritte
1. Lies die Projektdoku in dieser Reihenfolge:
   - `CLAUDE.md` (Architektur, Schichten, Invarianten, Dark Patterns)
   - `README.md` (Verzeichnisübersicht, Entscheidungstabelle)
   - `ENGINE-BRIEF.md` (Engine-Spezifikation, Tests, Grenzen)
2. Identifiziere die betroffenen Module anhand der Schichtenkarte in `CLAUDE.md`:
   `app/`, `components/`, `data/`, `lib/`, `state/`, `types/`, `test/`.
3. Prüfe die harten Grenzen (Schichtregeln, Paytable-Auswirkungen) per ESLint,
   bevor du Importe/Änderungen planst.
4. Verifiziere kritische Fakten **am Code** (nicht spekulieren), besonders Pfade,
   Funktions- und Typ-Namen, CreditsMinor-Handling, RNG-Nutzung.

## Regeln
- Erfinde keine Architekturdetails. Unsicheres mit `Zu verifizieren` markieren.
- Melde **Widersprüche zwischen Code und CLAUDE.md** explizit (Code ist die Wahrheit).
- Beachte: RTP-Wahrheit liegt in `data/paytables/`, CreditsMinor nur über `lib/formatters.ts`, RNG nur `mulberry32`.

## Ausgabe
- Kurzer Kontextabriss: betroffene Dateien/Module, geltende Regeln, Risiken/Annahmen,
  empfohlener Vorgehensweg. Verweise mit relativen Pfaden.
