# Auftragsrahmen für Spiel-Engines (Velora Casino Demo)

Diese Datei ist die verbindliche Vorgabe für alle Engine-Implementierungen. Sie ergänzt
`velora-implementierungs-prompt.md` und `velora-konzept.md` — bei Widersprüchen gelten diese beiden.

## Harte Regeln (Abbruchgründe, keine Schönheitsfehler)

1. **Geld ist ganzzahlig.** Alle Beträge sind `CreditsMinor` (Hundertstel). Nie `float` für Guthaben,
   nie eigene Formatierung — ausschließlich `formatCredits*` aus `lib/formatters`.
2. **Kein `Math.random()` in Spiellogik.** Ausschließlich `mulberry32` aus `lib/rng`, gesät mit dem
   Rundenseed. Gleicher Seed + gleiche Eingabe ⇒ identisches Ergebnis. Kein Zustand zwischen Runden.
3. **Ausgewiesener RTP = Erwartungswert der Tabelle.** Wer einen RTP zeigen will, liefert eine Tabelle
   in `data/paytables/<datei>.ts`. `rtpDemo` wird daraus automatisch abgeleitet (`data/catalog.ts`) —
   **niemals** von Hand in `data/games.ts` eintragen. Ohne Tabelle: kein RTP. Das ist erlaubt und
   für interaktive Spiele (Blackjack, Mines) sogar richtig.
4. **Keine Dark Patterns** (Regel 7 des Prompts), im Code zu kommentieren:
   - kein *Near Miss*: ein knapp verfehltes Ergebnis wird nie hervorgehoben oder betont animiert
   - kein *Loss Disguised as Win*: Rückgabe unter Einsatz wird nie gefeiert; angezeigt wird netto
   - kein Autoplay, kein Turbospin, keine Wiederhol-Automatik
   - keine vorausgewählte Bonusoption
   - kein Ton
   - Pause bleibt sichtbar und erreichbar
5. **Keine realen Marken**, keine Personenfotos, auch nicht im Live-Bereich.
6. **Keine Strategieempfehlungen** in Texten („mit dieser Strategie gewinnst du sicher“ ist verboten).
   Sachliche Regelerklärungen sind erwünscht.

## Architektur

- **Fachlogik** liegt rein und ohne React in `components/game/engine/<familie>/<name>-logic.ts`
  (oder `lib/`-nah, aber im Engine-Ordner). Sie ist ohne Rendering testbar.
- **Oberfläche** liegt in `components/game/engine/<familie>/<Name>Game.tsx`, ist `"use client"` und
  exportiert eine benannte Komponente mit genau dieser Signatur:
  ```ts
  export function XyzGame({ game, simulateLoadError, onStatusChange }: GameEngineViewProps)
  ```
  Der Typ steht in `types/engine.ts`. Die Registry (`components/game/engine/registry.tsx`) ist
  bereits verdrahtet — **nicht anfassen**.
- **Runden-Choreografie** kommt aus `components/game/engine/useRound.ts`. Nicht selbst mit dem Wallet
  sprechen, nicht selbst Status verwalten. Der Hook liefert Laden, Einsatz, Sperren, Buchung,
  Doppelklick-Schutz, Inline-Fehler und alle sieben `RoundStatus`-Werte.
- **Rahmen-UI** kommt aus `components/game/engine/GameShell.tsx` (Kopfzeile, Einsatz, Ergebnis netto,
  RG-Sperre, Lade- und Fehlerzustand). Die Engine liefert nur die Spielfläche (`children`), optionale
  `controls` (z. B. Wettauswahl) und bei interaktiven Spielen eine eigene `primaryAction`.
- **Auszahlungstabellen** in `data/paytables/<deine-datei>.ts`, exportiert als benannter Array.
  `data/paytables/index.ts` führt sie zusammen — **nicht anfassen**.
  Schlüssel: `gameId` bei genau einer Tabelle, `gameId::betId`, wenn der Erwartungswert von der
  gewählten Wette abhängt. Zum Bauen `buildPaytable`/`uniformPaytable` aus `lib/paytable.ts`
  verwenden — sie prüfen, dass die Wahrscheinlichkeiten exakt auf 1 summieren.

### Interaktive Spiele (Ergebnis steht erst am Ende fest)

`useRound({ interactive: true })`. Beim Start wird eine **Obergrenze** der Rückgabe deklariert
(`maxReturnMinor` im `EngineOutcome`); der Wallet-Reducer akzeptiert beim Abschluss nur Beträge bis
dahin. Damit kann die Oberfläche keinen Betrag erfinden. Abschluss über `settle({ returnMinor, outcomeKey, outcomeLabel, detail })`.

## Barrierefreiheit (wird automatisiert geprüft)

- Überschriftenhierarchie ohne Sprünge; die Engine beginnt bei `h3` (die Shell rendert `h2`).
- Jedes Bedienelement hat einen zugänglichen Namen; Touch-Ziele ≥ 44 × 44 px.
- Status nie allein über Farbe — immer Text oder Icon dazu.
- Spielflächen, die Ergebnisse anzeigen, brauchen `aria-live="polite"` an der richtigen Stelle
  (die Shell übernimmt das für die Ergebniszeile — nicht doppeln).
- Kein horizontales Scrollen bei 320 px Breite.
- `prefers-reduced-motion`: Deckkraftwechsel bleiben, Transformationen entfallen. Vorhandene
  Utility-Klassen nutzen (`anim-fade-in`, `transition-state`, …), keine eigenen Keyframes mit
  Transformationen ohne Media-Query-Fallback.

## Farben und Gestaltung

Nur Tokens verwenden (`bg-surface`, `text-primary`, `text-muted`, `border-border-subtle`,
`border-border-control`, `text-teal`, `text-gold`, `text-success`, `text-warning`, `text-danger`).
**Gold ist knapp**: pro Bildschirm höchstens eine goldene Fläche — die liegt bereits beim
Start-Button der Shell. Engine-Bedienelemente sind Umriss oder Text, niemals `bg-gold`.
`--border-subtle` ist rein dekorativ und nie die alleinige Markierung eines Bedienelements.

## Tests (Pflicht, müssen grün sein)

Lege `<name>-logic.test.ts` neben die Logik. Mindestens:

1. Auszahlungstabelle summiert auf 1 und trifft den ausgewiesenen RTP über **5.000.000 simulierte
   Runden** mit Toleranz ±0,5 Prozentpunkte (Vorbild: `lib/rng.test.ts`).
2. Determinismus: gleicher Seed ⇒ gleiches Ergebnis; unterschiedliche Seeds ⇒ nicht immer gleich.
3. Ergebnisbeträge sind ganzzahlig und nie negativ.
4. Fachregeln der jeweiligen Engine (z. B. Kartenwerte, Ziehregeln, Nachbarschaft im Kessel).
5. Anti-Near-Miss, wo die Darstellung Symbole zeigt (Vorbild: `components/game/slot/symbols.test.ts`).

Ausführen: `npx vitest run <dein Pfad>`; Typen: `npx tsc --noEmit`; Lint: `npx eslint <deine Dateien>`.
`node` liegt unter `~/.local/bin` — `export PATH=$HOME/.local/bin:$PATH` voranstellen.
**Keine Builds starten** (`next build`/`next dev`) — das kollidiert mit den anderen Agenten.

## Sprache und Ton

Alles auf Deutsch, sachlich, keine Ausrufezeichen-Werbesprache. Meldungen folgen dem Muster
**Was ist passiert → Was jetzt tun**, ohne Entschuldigung, ohne Stacktrace. Code-Kommentare erklären
das *Warum*, nicht das Offensichtliche.

## Dateigrenzen

Schreibe **ausschließlich** in die dir zugewiesenen Dateien. Gemeinsame Dateien (`registry.tsx`,
`data/paytables/index.ts`, `data/games.ts`, `data/catalog.ts`, `useRound.ts`, `GameShell.tsx`,
`state/**`, `lib/**`) sind gesperrt. Fehlt dir dort etwas, beschreibe es im Schlussbericht,
statt es zu ändern.
