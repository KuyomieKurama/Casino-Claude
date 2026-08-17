---
name: architecture-review
description: Architektur-Bewertung von Velora-Änderungen oder -Vorschlägen. Einsetzen bei neuen Engines, größeren Refactorings, neuen Abhängigkeiten oder wenn geprüft werden soll, ob eine Änderung zu den Schichten-/Grenzenregeln passt.
---

# Skill: architecture-review

Referenz: `CLAUDE.md` (Schichtregeln, Invarianten), `ENGINE-BRIEF.md` (Engine-Grenzen, gesperrte Dateien).

## Prüfpunkte
- **Schichtengrenzen:** Einhaltung der ESLint-Regeln (`lib/**` importiert nicht aus `components|app|state`; `data/**` nur aus `types/` + gezielt `lib/paytable|lib/rng`; `components/ui/**` nicht aus `state|data`). Verstöße sind Blocker.
- **CreditsMinor-Konsistenz:** alle Geldbeträge ganzzahlig; Formatierung nur via `lib/formatters.ts`.
- **RNG-Determinismus:** nur `mulberry32(seed)`, kein `Math.random()` in Engines; Reproduzierbarkeit gewährleistet.
- **RTP-Wahrheit:** Paytable in `data/paytables/`, RTP wird in `data/catalog.ts` berechnet, nicht von Hand gepflegt.
- **Engine-Registry:** View-Signatur korrekt, Lazy-Loading via `next/dynamic`, Registry-Eintrag vorhanden.
- **Abhängigkeiten:** neue Dependencies rechtfertigen (wirklich nötig? Auswirkung auf Bundle/RNG/Prüfbarkeit?).
- **Komplexität:** unnötige Abstraktionen/Indirektionen erkennen; Konsistenz mit Engine-Mustern.

## Vorgehen
1. Betroffene Schichten/Module + Engine-Grenzen identifizieren.
2. Änderung gegen Grenzen, Datenfluss und gesperrte Dateien abgleichen.
3. Abweichungen + risikoärmere Alternativen benennen.

## Ausgabe
- Bewertung als **Passt / Bedenken / Verstoß**, je Punkt mit Begründung, Pfadangabe und
  konkreter Empfehlung. Unsicheres als `Zu verifizieren` markieren. Keine stillen Code-Änderungen.
