# Velora Casino Demo

Klickbarer Frontend-Prototyp einer Casino-Lobby mit simuliertem Guthaben, simuliertem Login und
Mock-Admin-Zugang. Zweck ist die Demonstration von Oberfläche, Bedienung und Informationsarchitektur.

**Kein Echtgeld. Keine Einzahlung. Keine Auszahlung. Keine Lizenz. Kein Backend.**

## Schnellstart

```bash
npm install
npm run dev        # http://localhost:3000
```

Weitere Befehle:

```bash
npm run build      # Produktionsbuild (statisch, 43+ Seiten)
npm start          # Produktionsserver
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint inkl. Schichtregeln
npm test           # Vitest
node scripts/generate-thumbs.mjs   # Vorschaubilder neu erzeugen
```

Node 22 wird vorausgesetzt.

## Wo was liegt

```
app/           Routen und Layouts (App Router)
components/
  ui/          zustandslose Primitive (Button, Input, Modal, Toast …) — kennen keine Fachlogik
  layout/      Header, Bottom-Nav, Footer, Demo-Streifen, systemweite Hinweise
  game/        Spielkarte, Raster, Lobby, Detailseite
  game/engine/ Spiel-Engines: gemeinsame Choreografie (useRound), Rahmen-UI (GameShell), Registry
  wallet/      Demo-Wallet, Guthabenanzeige, Transaktionsliste
  rg/          Session-Timer, Responsible-Gaming-Panel, Zwei-Schritt-Dialoge
  feedback/    EmptyState, ErrorState, AsyncBoundary
data/          typisierte Mock-Daten; paytables/ enthält die dokumentierten Auszahlungstabellen
lib/           reine Funktionen: filters, formatters, validation, rng, paytable, storage
state/         Provider und Reducer je Domäne
types/         gemeinsame Typen
```

**Schichtregeln** (per ESLint durchgesetzt): `lib/` importiert nichts aus `components/`, `app/` oder
`state/`; `data/` importiert nur aus `types/`; `components/ui/` kennt keinen Context; LocalStorage
wird ausschließlich in `lib/storage.ts` angefasst.

## Entscheidungen, die man kennen sollte

| Thema | Umsetzung | Warum |
|---|---|---|
| Geld | `CreditsMinor` = ganzzahlige Hundertstel, Formatierung nur über `formatCredits*` | Fließkommafehler machen die Prüfung „Guthaben ausreichend?“ unzuverlässig |
| Zufall | gesäter PRNG (mulberry32), `Math.random()` nur für den Startseed | Runden sind über ihren Seed reproduzierbar und damit testbar |
| RTP | wird in `data/catalog.ts` aus der Auszahlungstabelle **berechnet**, nie von Hand gepflegt | Ausgewiesener Wert kann gar nicht von der Simulation abweichen |
| Spiele ohne Tabelle | zeigen bewusst **keinen** RTP | Behauptet wird nur, was geprüft werden kann |
| Passwörter | werden validiert und sofort verworfen — nicht gespeichert, nicht gehasht, nicht geloggt | In einer LocalStorage-App gibt es keinen sicheren Ort dafür |
| Admin-Rolle | offener Umschalter statt simuliertem Login | Clientseitige Rollenprüfung ist Anzeigelogik, kein Schutz — ein Passwortfeld davor wäre Sicherheitstheater |
| Ergebnisanzeige | netto (`−0,60 Credits`), nie brutto | Eine Rückgabe unter Einsatz ist ein Verlust und wird nicht als Gewinn dargestellt |
| Hydration | `hydrated`-Flag; vorher Skeletons in Zielgröße | Nie einen Platzhalterwert wie 1.000,00 zeigen, der dann springt |
| Persistenz | ein Schlüssel `velora.demo.v1` mit `schemaVersion`, gedrosseltes Schreiben | Defektes JSON und fremde Versionen werden verworfen statt geraten |

## Bewusst nicht vorhanden

Autoplay, Turbospin, betonte Beinahe-Treffer (Near Miss), Gewinnfanfaren bei Rückgaben unter Einsatz
(Loss Disguised as Win), vorausgewählte Bonusoptionen, Ton, Countdown-Timer mit Druckwirkung,
künstliche Verknappung, Gewinnversprechen, Strategieempfehlungen, Tracking, Analytics.

Ebenso nicht vorhanden und auch nicht simuliert: Zahlungsanbindung, KYC, Altersverifikation,
Lizenzdarstellung, serverseitige Authentifizierung, echte Spiel-Engines, Multiplayer, Live-Video.

## Neue Spiel-Engine hinzufügen

1. Fachlogik als reine Funktionen in `components/game/engine/<familie>/<name>-logic.ts`
2. Auszahlungstabelle in `data/paytables/<familie>.ts` (Schlüssel `gameId` oder `gameId::betId`),
   gebaut mit `buildPaytable` aus `lib/paytable.ts`
3. Oberfläche als `components/game/engine/<familie>/<Name>Game.tsx` auf Basis von `useRound` und
   `GameShell`
4. Eintrag in `components/game/engine/registry.tsx`
5. Tests: Tabelle summiert auf 1, RTP über 5.000.000 Runden, Determinismus, Fachregeln

Der verbindliche Rahmen steht in `ENGINE-BRIEF.md`.

## Prüfliste für den manuellen Durchgang

Siehe `PRUEFLISTE.md`.
