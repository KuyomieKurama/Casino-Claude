---
name: engine-development
description: Neue Spiel-Engine in Velora hinzufügen — fünfschrittiger Workflow von Logik über Paytable, View, Registry bis Tests.
---

# Skill: engine-development

Zweck: Neue Casino-Spiel-Engine nach Velora-Spezifikation implementieren, alle Regeln und Tests beachten.

## Fünfschritte-Workflow

### 1. Spiellogik schreiben
- Datei: `components/game/engine/<familie>/<name>-logic.ts`
- Reine TypeScript-Funktionen (kein React, kein State zwischen Runden)
- Input: `seed`, `stakeMinor` (CreditsMinor), Spiel-spezifische Optionen (z. B. gewählte Wette)
- Output: `{ seed: number, returnMinor: CreditsMinor, outcomeKey: string, outcomeLabel: string, detail: {...} }`
- RNG: ausschließlich `mulberry32(seed)` aus `lib/rng.ts`; kein `Math.random()`
- Geld: nur `CreditsMinor` (ganzzahlige Hundertstel), Arithmetik ganzzahlig

### 2. Auszahlungstabelle definieren
- Datei: `data/paytables/<familie>.ts`
- Format: `buildPaytable()` oder `uniformPaytable()` aus `lib/paytable.ts`
- Schlüssel: `gameId` (ein RTP für alle) oder `gameId::betId` (RTP variiert mit Wette)
- Invariante: Wahrscheinlichkeiten müssen auf exakt 1.0 summieren
- Einträge: `{ outcome: string, probability: number, returnMinor: CreditsMinor }`
- **Keine RTP-Hand-Pflege** — wird in `data/catalog.ts` automatisch berechnet

### 3. View-Komponente schreiben
- Datei: `components/game/engine/<familie>/<Name>Game.tsx`
- `"use client"` am Anfang
- Export: benannte Komponente mit Signatur: `export function XyzGame({ game, simulateLoadError, onStatusChange }: GameEngineViewProps)`
- Nutzung: `useRound()` Hook für Choreografie (Load, Lock, Stake, Settle), `GameShell` für Rahmen-UI
- Rückgabe: `settle({ returnMinor, outcomeKey, outcomeLabel, detail })`
- Interaktive Spiele: `useRound({ interactive: true })` mit `maxReturnMinor`-Obergrenze
- A11y: Hierarchie ab h3, `aria-live="polite"` auf Ergebniszeile (Shell übernimmt), Touch ≥44×44 px
- Design: nur Tokens (`text-primary`, `border-border-subtle`, etc.); Gold nur wenn Shell nicht Gold nutzt

### 4. Registry-Eintrag
- Datei: `components/game/engine/registry.tsx` (nur Registry-Eintrag anfassen, Rest gesperrt!)
- Format: `{ id: "gameId", component: dynamic(() => import("./familie/XyzGame").then(m => m.XyzGame), { ssr: false, loading: () => ... }) }`

### 5. Tests schreiben
- Datei: `components/game/engine/<familie>/<name>-logic.test.ts` (neben Logic)
- Mindestens:
  1. **Paytable-Summation:** Tabelle summiert auf 1.0 exakt
  2. **RTP-Treffer:** 5.000.000 simulierte Runden, Erwartungswert ±0,5 Prozentpunkte zum ausgewiesenen RTP
  3. **Determinismus:** gleicher Seed + gleiche Eingabe ⇒ gleiches Ergebnis; unterschiedliche Seeds ⇒ nicht immer gleich
  4. **Ganzzahligkeit:** alle `returnMinor`-Beträge ganzzahlig und ≥0
  5. **Fachregeln:** Kartenwerte, Ziehregeln, Nachbarschaften (spielabhängig)
  6. **Anti-Near-Miss:** bei Symbol-Darstellung: Ergebnisse mit ±1-Symbol-Abstand zur Gewinnkombination nicht animiert/hervorgehoben
- Ausführung: `npx vitest run <pfad>`

## Typ-Signaturen
Aus `types/engine.ts`:
```typescript
export interface GameEngineViewProps {
  game: CasinoGame
  simulateLoadError?: boolean
  onStatusChange?: (status: RoundStatus) => void
}
```

RoundStatus-Werte: `idle`, `loading`, `ready`, `playing`, `paused`, `finished`, `error`

## Gesperrte Dateien (nicht ändern)
- `components/game/engine/useRound.ts` — Choreografie
- `components/game/engine/GameShell.tsx` — Rahmen-UI, Einsatz, Ergebnis netto, Status-Zeile
- `components/game/engine/registry.tsx` — außer deinem Registrierungs-Eintrag
- `data/paytables/index.ts` — Sammlung
- `data/games.ts`, `data/catalog.ts` — Master-Listen
- `state/**`, `lib/**` — Kern-Utilities
- `types/` — Typ-Definitionen

## Prüfliste
- [ ] Logic nutzt nur `mulberry32`, keine `Math.random()`
- [ ] View hat korrekte Signatur, nutzt `useRound` + `GameShell`
- [ ] Paytable summiert exakt auf 1.0
- [ ] RTP-Test läuft über 5.000.000 Runden, ±0,5 pp Toleranz
- [ ] Determinismus-Test vorhanden
- [ ] Keine negativen oder Float-Beträge
- [ ] Fachregeln getestet
- [ ] Anti-Near-Miss für Symbole geprüft
- [ ] Registry-Eintrag hinzugefügt
- [ ] `npm test` grün, `npm run lint` grün, `npm run typecheck` grün
- [ ] Engine-Brief gelesen und alle Regeln beachtet

## Referenzen
- `ENGINE-BRIEF.md` — verbindlicher Rahmen (harte Regeln, Barrierefreiheit, Tests)
- `CLAUDE.md` — Schichtregeln, Invarianten, Dark Patterns
- `README.md` — Schnellstart, Verzeichnisübersicht
- Vorbild-Engines: `components/game/engine/arcade/`, `components/game/engine/roulette/`, `components/game/engine/slot/`
