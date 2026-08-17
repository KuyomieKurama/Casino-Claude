---
name: testing
description: Tests für Velora schreiben oder erweitern (Vitest + Testing Library). Einsetzen, wenn neue Engine-Logik hinzukommt, ein Bug einen Regressionstest braucht oder RTP-/Determinismus-Tests fehlen.
---

# Skill: testing

Testframework: **Vitest** (+ Testing Library, jsdom). Befehle: `npm test`, `npm run test:watch`,
`npx vitest run <pfad>`.

## Bestehende Muster (übernehmen, nicht neu erfinden)
- Speicherorte: kolozierte `*.test.ts`/`*.test.tsx` neben der Quelle; projektweite Tests in `test/catalog.test.ts`.
- Setup: `test/setup.ts` — `globals: true`, `testTimeout: 120_000` (Millionen-Runden-RTP-Simulations-Support).
- Unit: reine Funktionen (Logic-Dateien, `lib/`).
- Komponenten: Testing Library für Engine-Views.
- RTP-/Determinismus-Tests: `lib/rng.test.ts` als Vorbild (5.000.000 Runden, ±0,5pp-Toleranz).
- Anti-Near-Miss: `components/game/slot/symbols.test.ts` als Vorbild.

## Vorgehen
1. Testart wählen: **Unit** (Logic, RNG, Formatters), **Komponenten** (Engine-Views mit Testing Library) — kein E2E.
2. Grenzfälle: leere Daten, ungültige Seeds, CreditsMinor-Grenzen, RNG-Zyklen.
3. Bei Bugfix: zuerst **Regressionstest**, der den Fehler reproduziert.
4. Bei Engine-Neubau: Tabelle summiert 1, RTP-Treffer ±0,5pp über 5.000.000 Runden, Determinismus, keine negativen Beträge.

## Regeln
- **Kein neues Testframework** ohne klare Notwendigkeit.
- Keine `Math.random()` in Tests — `mulberry32(seed)` für Reproduzierbarkeit.
- Aussagekräftige Assertions (Beträge, Status, Regelkonformität), keine Trivialtests.

## Ausgabe
- Neue/aktualisierte Testdateien + kurze Begründung der abgedeckten Fälle; Bestätigung `npm test` grün.
