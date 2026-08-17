---
name: documentation
description: Dokumentation in Velora aktualisieren oder prüfen — bei neuen Engines, Features, API-Änderungen oder Verhaltensänderungen. Einsetzen, um Code und Markdown-Doku konsistent zu halten.
---

# Skill: documentation

Zweck: Doku konsistent zum Code halten; nichts dokumentieren, das nicht implementiert ist.

## Doku-Landschaft
- `README.md` — Schnellstart, Verzeichnisübersicht, Entscheidungstabelle, Kurzanleitung "Neue Spiel-Engine".
- `CLAUDE.md` — Projekt-Anweisungen, Befehle, Stack, Schichtregeln, Invarianten, Dark Patterns, Engine-Architektur.
- `ENGINE-BRIEF.md` — verbindlicher Rahmen für Engine-Implementierungen (harte Regeln, Architektur, Tests, Dateigrenzen).
- `PRUEFLISTE.md` — manuelle QA-/Durchgangs-Checkliste.
- `BERICHT.md` — Abschlussbericht mit Stand und Begründungen.
- Keine `docs/`-Verzeichnis, kein generierter Inhalt.

## Schritte
1. Betroffenen Bereich bestimmen; relevante `.md`-Dateien finden (Grep nach Begriffen/Pfaden).
2. Code mit Doku abgleichen; veraltete/widersprüchliche Abschnitte markieren.
3. Doku gezielt aktualisieren (relative Pfade, konkrete Befehle aus `CLAUDE.md`).
4. Bei Engine-Änderung: sicherstellen, dass `CLAUDE.md` und `ENGINE-BRIEF.md` konsistent sind; ggf. `PRUEFLISTE.md` mitziehen.
5. Querverweise bei größeren Änderungen pflegen.

## Regeln
- Keine nicht implementierten Features dokumentieren.
- Keine Secrets/echten Werte in Beispielen (nur Platzhalter wie `<wert>`).
- CLAUDE.md und CODE sind die Wahrheit — README/BRIEF/Checklisten verweisen darauf, duplizieren nicht.

## Ausgabe
- Liste geänderter Doku-Dateien + kurze Begründung; Hinweis, ob `.md`-Konsistenz geprüft wurde.
