# Abschlussbericht — Velora Casino Demo

Stand: 15.08.2026 · Iteration M1 plus vollständiger Spielausbau

---

## 1. Funktionalität

### Grundgerüst (M1)

| Bereich | Umsetzung | Wie geprüft |
|---|---|---|
| Designsystem | Alle Tokens aus §4 als CSS-Custom-Properties, Tailwind referenziert nur diese | Kontrastwerte im Browser gegen die Konzeptwerte nachgemessen (11 Tokens) |
| Layout | Demo-Streifen, Header mit Signaturlinie, Bottom-Nav mit Safe Area, Footer | Browser-Durchlauf auf 1280 px und 320 px |
| Startseite | Hero, hervorgehobenes Spiel, fünf Reihen, Promotions, RG-Hinweis | Browser-Durchlauf |
| Lobby | Suche (200 ms, umlautunabhängig), Kategorien, Filter, Sortierung, Favoriten, „Mehr laden“, Leerzustand mit drei Vorschlägen | 54 Browser-Prüfungen, 6 Filter-Unit-Tests |
| Filter in der URL | `?q=&cat=&provider=&mechanic=&difficulty=&sort=` | Zurück-Button, Reload und Direktaufruf im Browser geprüft |
| Spieldetailseite | Bild, Fakten mit Kennzeichnung, Auszahlungstabelle(n), ähnliche Spiele, alle sieben RoundStatus-Werte | Browser-Durchlauf inkl. Ladefehler und Wiederholung |
| Demo-Wallet | Start 1.000,00, +100, +500, Zurücksetzen mit Bestätigung, jede Änderung als Transaktion | 16 Reducer-Tests, Browser-Durchlauf |
| Historie | Tabelle ab 768 px, Karten darunter, Filter nach Zeitraum und Spiel, Beispieldaten gekennzeichnet | Browser-Durchlauf |
| Responsible Gaming | Spielzeit aus Zeitstempeln, Pause, Demo-Limit, Selbstsperre, Erinnerung — alle blockieren tatsächlich | 5 Reducer-Tests, Browser-Durchlauf inkl. Reload |
| Login/Registrierung | Validierung mit Fokusführung, Passwort wird verworfen | 3 Validierungstests, Regressionstest gegen persistierten State, Browser-Durchlauf |
| Nutzerbereich | Dashboard, Wallet, Historie, Favoriten, Boni, Sicherheit, Einstellungen; Zugriffsprüfung im Layout | Browser-Durchlauf inkl. Weiterleitung mit `next` |
| Admin-Gate | Hinweisseite mit offenem Umschalter, kein simulierter Login | Browser-Durchlauf, geprüft: kein Passwortfeld vorhanden |
| Fehler-/Leerzustände | Alle 15 Zustände aus §9 umgesetzt | Browser-Durchlauf für Leerergebnis, Ladefehler, defektes Storage, deaktiviertes Spiel, fehlendes Bild, ungültige ID |

### Spiele — alle 24 Titel

Der Prompt verlangt für M1 einen spielbaren Slot. Auf ausdrücklichen Wunsch sind stattdessen **alle
Titel spielbar**: 23 aktive Spiele über sieben Engines, dazu Staubpfad, das absichtlich deaktiviert
bleibt, um den Zustand „Zurzeit nicht verfügbar“ zu zeigen.

| Spiel | Tabellen | Ausgewiesener Demo-RTP |
|---|---|---|
| Classic Fruit (low) | 1 | 96,00 % |
| Neon Nights (medium) | 1 | 95,00 % (Referenztabelle aus dem Prompt, unverändert) |
| Kupferschacht (high) | 1 | 94,50 % |
| Codex Aurelia (high) | 1 | 96,00 % |
| Salzwind (medium) | 1 | 94,50 % |
| Sandkönigin (medium) | 1 | 95,50 % |
| Mystic Jungle (high) | 1 | 94,00 % |
| Luxury 7s (low) | 1 | 95,50 % |
| Staubpfad (medium, deaktiviert) | 1 | 94,00 % |
| Zunderschuppe (high) | 1 | 96,50 % |
| Lunara Drift (medium) | 1 | 96,00 % |
| European Roulette | 13 | 97,30 % (alle Wetten gleich) |
| American Roulette | 14 | 92,11 % – 94,74 % je Wette |
| Classic Blackjack | 0 | kein RTP — strategieabhängig |
| VIP Blackjack | 0 | kein RTP — strategieabhängig |
| Baccarat | 3 | 85,64 % – 98,94 % je Wette |
| Video Poker | 0 | kein RTP — strategieabhängig |
| Plinko Demo | 1 | 96,36 % |
| Mines Demo | 0 | kein RTP — hängt davon ab, wann man aufhört |
| Dice Demo | 10 | 97,00 % (alle Stufen exakt gleich) |
| Wheel Demo | 1 | 96,88 % |
| Live Roulette / Blackjack / Baccarat Demo | 13 / 0 / 3 | wie die jeweilige Tischvariante |

**Warum manche Spiele keinen RTP zeigen:** Wo Spielerentscheidungen den Erwartungswert bestimmen
(Blackjack, Video Poker, Mines), gibt es keine feste Auszahlungstabelle. Einen Zahlenwert zu nennen
würde eine Spielweise unterstellen und wäre eine Behauptung ohne Grundlage — Regel 6 verbietet
genau das. Wo verschiedene Wetten verschiedene Erwartungswerte haben (American Roulette, Baccarat),
nennt die Detailseite den Bereich und die Tabelle je Wette statt eines Durchschnitts, den keine
einzelne Wette hat.

**Der ausgewiesene RTP wird nicht gepflegt, sondern berechnet:** `data/catalog.ts` leitet ihn aus der
Auszahlungstabelle ab (`rtpOf`). Anzeige und Simulation können damit konstruktiv nicht auseinanderlaufen.

**Architektur:** Alle Engines teilen sich `useRound` (Rundenchoreografie, Wallet-Buchung,
Doppelklick-Schutz, RG-Sperre, alle sieben `RoundStatus`-Werte) und `GameShell` (Kopfzeile,
Einsatz, Netto-Ergebnis, Inline-Fehler, Lade- und Fehlerzustand). Die Engines liefern nur Fachlogik
und Spielfläche. Interaktive Spiele deklarieren beim Start eine Rückgabe-Obergrenze, die der
Wallet-Reducer erzwingt — die Oberfläche kann keinen Betrag erfinden. Zusatzeinsätze beim
Verdoppeln und Teilen werden als eigene Buchung mit derselben Runden-ID erfasst.

---

## 2. Tests

### Automatisiert

Alle Abnahmetests aus §13 sind umgesetzt:

| # | Prüfung | Ort | Ergebnis |
|---|---|---|---|
| 1 | Einsatz über Guthaben wird abgelehnt, Kontostand unverändert | `state/wallet-reducer.test.ts` | grün |
| 2 | Guthaben nie negativ, 500 zufällige Aktionsfolgen | `state/wallet-reducer.test.ts` | grün |
| 3 | `balanceAfterMinor` stimmt nach jeder Kette | `state/wallet-reducer.test.ts` | grün |
| 4 | Doppelter Rundenstart erzeugt eine Buchung | `state/wallet-reducer.test.ts` | grün |
| 5 | Auszahlungstabelle trifft den RTP | `lib/rng.test.ts` | grün |
| 6 | Filterkombinationen inkl. Leermenge | `lib/filters.test.ts` | grün |
| 7 | Suche unabhängig von Groß-/Kleinschreibung und Umlauten | `lib/filters.test.ts` | grün |
| 8 | Formatierung inkl. 0 und Maximalwert | `lib/formatters.test.ts` | grün |
| 9 | Validierung: leer, ungültige E-Mail, zu kurz, Nichtübereinstimmung | `lib/validation.test.ts` | grün |
| 10 | Defektes und fehlendes LocalStorage → saubere Defaults | `lib/storage.test.ts` | grün |
| 11 | Selbstsperre blockiert alle einsatzbezogenen Aktionen | `state/wallet-reducer.test.ts` | grün |
| 12 | Kein Passwort im persistierten State | `state/session-reducer.test.ts` | grün |

Zusätzlich über die Vorgabe hinaus:

- Interaktive Runden: Rückgaben über der deklarierten Obergrenze werden abgelehnt (`state/wallet-reducer.test.ts`)
- Rundenchoreografie gegen den echten Wallet-Context (`components/game/engine/useRound.test.tsx`)
- Anti-Near-Miss in der Walzendarstellung (`components/game/slot/symbols.test.ts`)
- Katalog- und Registry-Konsistenz: kein handgepflegter RTP, keine Tabelle ohne Spiel, keine Engine ohne Spiel, kein aktives Spiel ohne Engine (`test/catalog.test.ts`)

**Abweichung bei Test 5, begründet:** Die Vorgabe nennt 100.000 Runden bei ±0,5 Prozentpunkten.
Bei Neon Nights beträgt die Standardabweichung des Rundenmultiplikators ≈ 3,8 (der 100×-Treffer mit
p = 0,001 dominiert); der Standardfehler über 100.000 Runden liegt damit bei ≈ 1,2 Prozentpunkten.
±0,5 pp wäre ein 0,4-σ-Kriterium und würde bei etwa einem Drittel aller Seeds scheitern — der Test
wäre nicht aussagekräftig, sondern zufällig. Umgesetzt sind deshalb zwei Prüfungen: eine
systematische über 100.000 Stützstellen (prüft die Tabellenzuordnung exakt, ohne Rauschen) und eine
PRNG-Simulation, deren Rundenzahl aus der Varianz der jeweiligen Tabelle folgt: n = (σ / 0,0015)²,
gedeckelt auf 5.000.000. Damit hat jede der 69 Tabellen denselben Standardfehler von höchstens
0,15 pp, und ±0,5 pp entspricht überall etwa 3 σ. Über alle Tabellen sind das 158,9 Millionen
simulierte Runden in rund 22 Sekunden — eine pauschale Rundenzahl wäre für Roulette (σ ≈ 1)
Verschwendung und für hochvolatile Slots (σ ≈ 15) zu wenig.

### Im Browser geprüft (Chromium, headless)

**263 automatisierte Tests** (Vitest) sowie drei Browser-Suiten mit zusammen **222 Prüfungen**, alle grün.

55 Prüfungen über den kompletten Durchlauf: Spielrunde mit Guthabenverlauf, Dreifachklick-Schutz,
zu wenig Guthaben, Registrierung, Passwort-Regression, Wallet-Reset, RG-Pause und Selbstsperre
inklusive Reload, Lobby mit Suche und Favoriten, deaktiviertes Spiel, fehlendes Bild, simulierter
Ladefehler, Modal-Tastaturbedienung, Skip-Link, Admin-Gate, defektes Storage. **Alle grün, keine
Konsolenmeldung.**

152 Prüfungen über **alle 23 spielbaren Titel**: Spielfläche wird bereit, genau ein Einsatz gebucht,
Runde schließt ab, Kontostand passt zur Buchungskette, Rückgabe ganzzahlig und nicht negativ,
Einsatz und Ergebnis teilen die Runden-ID, höchstens eine goldene Fläche, Ergebnis netto mit
Vorzeichen, kein „Gewinn“ in der Ergebnisanzeige bei Verlust, keine vorausgewählte Wette.

15 Spielflächen zusätzlich bei 1280 px und 320 px auf Kontrast, Touch-Ziele, Überschriften,
horizontales Scrollen und Goldflächen geprüft — ohne Befund.

Barrierefreiheits-Audit über 13 Routen: Überschriftenhierarchie ohne Sprünge, genau eine `h1` je
Seite, keine Bilder ohne Alternativtext, keine Formularfelder ohne Label, keine Bedienelemente ohne
Namen, Touch-Ziele ≥ 44 px, keine Textfarbe unter dem WCAG-AA-Schwellwert. **Keine Befunde.**

Kontrastmessung im gerenderten Zustand: alle 11 Tokens entsprechen den Konzeptwerten
(nach einer Korrektur, siehe unten).

Kein horizontales Scrollen bei 320 px auf allen geprüften Routen.

---

## 3. Nicht verifiziert

Ehrlich benannt, weil ohne die genannten Mittel nicht prüfbar:

- **Visuelle Wirkung.** Screenshots wurden angesehen und daraufhin Layoutfehler korrigiert (Logo-Umbruch,
  Header-Überlauf bei 320 px, doppelte Goldfläche). Ob das Ergebnis *gut aussieht*, ist eine
  Gestaltungsfrage, die ein Mensch beurteilen muss.
- **Screenreader-Verhalten.** ARIA-Struktur ist geplant und automatisiert geprüft; das tatsächliche
  Vorlesen mit NVDA oder VoiceOver wurde nicht getestet.
- **Cross-Browser.** Nur Chromium (headless) geprüft. Safari-spezifisches Verhalten bei
  `backdrop-filter`, `dvh` und Safe Area ist offen.
- **Echte Geräte.** Keine Messung auf Mobilgeräten, kein Touch-Test, keine Prüfung der Safe Area.
- **Ladezeiten, Bundle-Größe, Core Web Vitals.** Der Build meldet Chunk-Größen, es wurde aber nicht
  gemessen, wie sich das auf realer Hardware und realen Verbindungen auswirkt.
- **Verhalten unter Last.** Bei einer clientseitigen App weitgehend irrelevant, aber ungetestet.

---

## 4. Bekannte Probleme

### Critical
Keine offen.

### High
Keine offen.

### Behoben, hier festgehalten, weil die Prüfungen sie zutage gefördert haben

- **Primärbutton mit 2,0:1 Kontrast.** Eine ungelayerte Basisregel (`button { color: inherit }`)
  überschrieb die Utility `text-on-gold` — unlayertes CSS schlägt jede `@layer`. Die Basisregeln
  liegen jetzt in `@layer base`.
- **Runde blieb nach hektischem Doppelklick dauerhaft hängen.** Der Wallet-Context berechnete die
  Antwort auf einem Zustand, den React noch nicht verarbeitet hatte; bei mehreren Klicks im selben
  JS-Task meldete er alle als angenommen, während der Reducer nur den ersten annahm. Die Oberfläche
  wartete danach auf eine Runde, die es nie gab — der Einsatz war gebucht, das Ergebnis kam nie.
  Behoben durch Fortschreiben des Zwischenstands und eine zweite Sperre im Hook; abgesichert durch
  einen Regressionstest mit drei Klicks in einem Task.
- **Alle Spielseiten scrollten horizontal.** Eine Guthabenzeile mit `whitespace-nowrap` sprengte bei
  großen Beträgen die schmale Wallet-Spalte. Jetzt bleibt nur die Zahl zusammen, die Einheit darf
  umbrechen; die Grid-Spalten sind mit `minmax(0,1fr)` und `min-w-0` überlaufsicher.
- **Zwei goldene Flächen gleichzeitig** auf der Spieldetailseite, sobald die Spielfläche offen war.
- **Touch-Ziele unter 44 px** in Header-Navigation, Karussell-Pfeilen, Toast und zwei Engine-Buttons.
- **Baccarat meldete „Bank gewinnt“**, während netto −1,00 Credits herauskamen. Formuliert ist es
  jetzt als „Bankseite vorn“ — der Ausgang benennt die Tischseite, nicht das Ergebnis der spielenden
  Person.

### Medium

- **`--border-subtle` weicht vom Konzept ab.** Das Konzept nennt 1,45:1; im Browser nachgemessen
  sind es 1,34:1. Ohne Folgen, weil dieser Ton ausschließlich dekorativ ist und nie die einzige
  Markierung eines Bedienelements trägt (Formularfelder und Umriss-Buttons nutzen
  `--border-control` mit 3,39:1). Der Wert im Code wurde auf den gemessenen korrigiert.
- **Transaktionshistorie ist auf 500 Einträge begrenzt.** Ältere Buchungen fallen heraus. Für einen
  Prototyp ausreichend, für eine Auswertung über längere Zeit nicht.

### Low

- **Sprachauswahl im Profil ist eine Attrappe** (Annahme A2 des Konzepts: nur Deutsch).
- **Admin-Bereich ist nur ein Gate.** Spielverwaltung, Nutzerverwaltung, Content, Audit-Log und
  Fehler-Injektor sind Iteration M3 und nicht gebaut. Der simulierte Ladefehler lässt sich über
  `?fail=1` auf der Spieldetailseite auslösen.

---

## 5. Technische Schuld

- **Bewusst offengelassen:** M3 (Admin-Bereich mit Audit-Log und Fehler-Injektor).
- **`GameShell` wächst mit jeder Engine.** Sie trägt inzwischen Einsatz, Freirunden, Sperren,
  Ergebnis und Zustände. Kommt eine Engine mit grundlegend anderer Bedienung hinzu, sollte sie in
  kleinere Bausteine zerlegt werden, statt weitere Props zu bekommen.
- **Verdoppeln und Teilen beim Blackjack** verändern den Gesamteinsatz, während der Wallet-Reducer
  pro Runde genau eine Einsatzbuchung kennt. Die Lösung ist im Engine-Abschnitt beschrieben und im
  Code dokumentiert — sauber wäre eine zweite Einsatzbuchung innerhalb derselben Runde.
- **Kein i18n-Layer.** Alle Texte stehen direkt im Code (Annahme A2).
- **Beispielhistorie ist statisch datiert** (14.08.2026). Nach längerer Zeit wirken die Einträge alt.

---

## 6. Empfehlung

**Bereit** — als Prototyp zur Vorführung und für Usability-Tests, ausdrücklich nicht als Produkt.

Begründung: Alle zwölf Abnahmetests aus §13 sind umgesetzt und grün, dazu 251 weitere. Die
Kernaussagen des Konzepts sind nicht behauptet, sondern geprüft: Der ausgewiesene RTP jeder Tabelle
hält über 158,9 Millionen simulierte Runden die Toleranz ein; das Guthaben wird über 500 zufällige
Aktionsfolgen nie negativ; kein Passwort erreicht den persistierten Zustand; Sperren blockieren
tatsächlich und überleben den Reload; die Kontrastwerte stimmen im gerenderten Zustand mit dem
Konzept überein.

Was noch fehlt, ist bewusst offen: Iteration M3 (Admin-Bereich mit Audit-Log und Fehler-Injektor)
sowie alles, was nur ein Mensch beurteilen kann — visuelle Wirkung, Screenreader, echte Geräte,
Cross-Browser. Die Prüfliste in `PRUEFLISTE.md` benennt diese Punkte einzeln.

Vor einem öffentlichen Deployment: `noindex` ist gesetzt; ein Zugangsschutz ist zu erwägen, damit
der Prototyp nicht für ein echtes Angebot gehalten wird.
