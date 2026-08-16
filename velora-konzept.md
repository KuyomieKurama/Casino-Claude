# Velora Casino Demo — Konzept & Architektur

**Status:** Phase 1–3 (Analyse, Architektur, UX/UI). Keine Implementierung.
**Version:** 0.1 — Entwurf zur Freigabe
**Datum:** 14.08.2026

---

## 0. Wie dieses Dokument zu lesen ist

Es ist kein Feature-Echo der Anforderung, sondern eine Bewertung. An mehreren Stellen weiche ich bewusst von der Vorgabe ab. Jede Abweichung ist als **Abweichung** markiert und begründet. Abschnitt 12 listet auf, was ich nicht prüfen konnte.

Priorisierung durchgehend: **Critical → High → Medium → Low**.

---

## 1. Produktübersicht

### 1.1 Was gebaut wird

Ein klickbarer Frontend-Prototyp einer Casino-Lobby mit simuliertem Guthaben, simuliertem Login und einem Mock-Admin-Bereich. Zweck ist die Demonstration von UI, UX und Informationsarchitektur — nicht der Betrieb eines Glücksspielangebots.

### 1.2 Zielgruppen

| Gruppe | Nutzt den Prototyp für | Konsequenz fürs Design |
|---|---|---|
| Stakeholder / Auftraggeber | Bewertung des visuellen Konzepts | Startseite muss in <5 s überzeugen und den Demo-Charakter erklären |
| Designer / Entwickler | Vorlage für die Umsetzung | Tokens, Komponenten und Typen müssen sauber getrennt sein |
| Fachbereich Compliance | Prüfung, ob nichts Reales versprochen wird | Demo-Kennzeichnung an jeder Stelle mit Geldbezug |
| Endnutzer-Testpersonen | Usability-Tests | Flows müssen ohne Erklärung funktionieren |

### 1.3 Nicht-Ziele

Echtgeld, Zahlungsanbindung, KYC, Altersverifikation, Lizenzdarstellung, echte Spiel-Engines, Multiplayer, echtes Live-Video, Server-Backend, Tracking/Analytics.

### 1.4 Dokumentierte Annahmen

Die Anforderung lässt diese Punkte offen. Ich lege sie fest — Widerspruch jederzeit möglich:

| # | Annahme | Wenn falsch, dann |
|---|---|---|
| A1 | Rein clientseitig, kein Server, keine Datenbank | Auth- und Admin-Architektur ändert sich grundlegend |
| A2 | Deutsch als einzige Sprache; Sprachauswahl im Profil ist UI-Attrappe | i18n-Layer nötig, +20 % Aufwand |
| A3 | Spiel-Thumbnails werden als generierte oder lizenzfreie Platzhalter erstellt | Asset-Beschaffung wird eigener Arbeitsschritt |
| A4 | Zielbrowser: aktuelle Chrome-, Firefox-, Safari- und Edge-Versionen | Ältere Browser bedeuten Polyfills und anderes CSS |
| A5 | Kein Consent-Banner nötig, da nur funktionaler LocalStorage und keine Tracker | Bei späterem Analytics-Einbau: Consent-Layer nachrüsten |
| A6 | „Live-Casino" bleibt statische Illustration, kein Video | Video wirft Rechte-, Performance- und Autoplay-Fragen auf |
| A7 | Der Prototyp wird öffentlich erreichbar deployed | Zusätzlich: `noindex`, robots.txt, Zugangsschutz erwägen |

### 1.5 Lücken und Widersprüche in der Anforderung

| # | Befund | Priorität | Vorschlag |
|---|---|---|---|
| L1 | „200 Freispiele" wird als Promotion genannt, eine Freispiel-Mechanik existiert im Datenmodell nicht | High | `freeSpins: number` in die Wallet aufnehmen; eine Freirunde verbraucht einen Freispiel statt Credits |
| L2 | `bonusBalance` existiert, aber ohne jede Regel — Umsatzbedingungen? Auszahlbarkeit? | High | Bonusguthaben bleibt rein additiv und ohne Bedingungen. Umsatzbedingungen zu simulieren würde Mechaniken einüben, die im Echtgeldfall reguliert sind |
| L3 | „RTP: Demo-Wert 96,2 %" auf der Detailseite, ohne dass die Simulation daran gebunden ist | **Critical** | Siehe C3 |
| L4 | Selbstsperre ist gefordert, aber kein Weg zurück definiert | High | Entsperren nur über expliziten Zwei-Schritt-Dialog im Responsible-Gaming-Bereich, nie über einen Banner-Button |
| L5 | „Simulierte technische Fehler" im Admin-Dashboard — Herkunft unklar | Low | Ein Fehler-Injektor im Admin-Bereich, der echte Fehlerzustände in der App auslöst. Damit sind die Fehler-States auch demonstrierbar |
| L6 | Spielhistorie zeigt „Kontostand danach", Transaktionen brauchen also garantierte Reihenfolge | Medium | Monoton steigende Sequenznummer statt Sortierung nach Zeitstempel |
| L7 | Umfang entspricht ~9 Routen, ~30 Komponenten, 5 Fachdomänen | High | Schnitt in drei Iterationen, siehe 1.6 |

### 1.6 Vorgeschlagener Schnitt

Alles gleichzeitig zu bauen erzeugt viel halbfertige Oberfläche. Besser:

**M1 — Tragendes Gerüst.** Designsystem, Layout, Startseite, Lobby mit Suche/Filter/Sortierung/Favoriten, Spieldetailseite, Demo-Wallet, ein vollständig durchgespielter Slot, Responsible-Gaming-Seite, alle Fehler- und Leerzustände. **Das ist die Version, die man zeigen kann.**

**M2 — Konto.** Registrierung, Login, Dashboard, Spielhistorie, Profil, Sicherheit, Promotions.

**M3 — Admin.** Mock-Backend, Spielverwaltung, Nutzerverwaltung, Content, Audit-Log, Fehler-Injektor.

Nach M1 ist eine ehrliche Bewertung möglich. Nach M3 ist alles vorhanden, aber jede Korrektur wird teurer.

---

## 2. Kritische Befunde vorab

Diese Punkte ändern die Spezifikation und sollten vor der Implementierung entschieden sein.

### C1 — Der Admin-Bereich ist keine Sicherheitsgrenze (Critical)

In einer rein clientseitigen App ist jede Rollenprüfung eine Anzeigelogik. Wer LocalStorage bearbeitet, ist Admin. Der gesamte Admin-Code liegt ohnehin im ausgelieferten Bundle.

**Maßnahme:** Die Rolle wird nicht versteckt, sondern offen umschaltbar gemacht — „Demo-Admin-Ansicht aktivieren" in den Einstellungen, mit dem Hinweis, dass echte Autorisierung serverseitig gehört. Ein simuliertes Passwortfeld davor wäre Sicherheitstheater und würde Prüfer täuschen. Der Abnahmetest „Admin-Bereich ohne Rolle blockieren" prüft dann korrektes Routing-Verhalten, nicht Sicherheit.

### C2 — Kommazahlen für Guthaben (Critical)

`demoBalance: number` mit Werten wie 0,10 führt zu Fließkommafehlern. Nach genügend Runden steht 999,9999999999998 Credits auf dem Konto, und die Prüfung „Guthaben ausreichend?" wird unzuverlässig.

**Abweichung vom Datenmodell:** Intern wird in ganzzahligen Hundertsteln gerechnet (1 Credit = 100 Einheiten). Formatierung ausschließlich an der UI-Grenze über `formatCredits()`. Der Typ heißt `demoBalanceMinor: number` — der Name verhindert, dass jemand versehentlich Einheiten mischt.

### C3 — Ausgewiesener RTP und tatsächliche Simulation müssen zusammenpassen (Critical)

Wenn die Detailseite „RTP: Demo-Wert 96,2 %" anzeigt, die Zufallslogik aber faktisch 70 % ausschüttet, ist die Angabe irreführend — genau das, was die Anforderung ausschließen will.

**Maßnahme:** Jedes Spiel bekommt eine explizite, dokumentierte Auszahlungstabelle, deren Erwartungswert dem angezeigten Demo-RTP entspricht. Ein automatisierter Test simuliert 100.000 Runden pro Spiel und prüft die Abweichung gegen eine Toleranz. Was nicht getestet werden kann, wird nicht behauptet: Spiele ohne verifizierte Tabelle zeigen keinen RTP-Wert.

### C4 — Mehrere Spieltitel entsprechen realen Produkten (Critical)

Titel wie *Moon Princess*, *Book of Fortune*, *Gold Rush*, *Wild West* und *Dragon's Treasure* decken sich mit real existierenden Slots am Markt. Für einen Prototyp mit echtem Casino-Look ist das ein vermeidbares Marken- und Verwechslungsrisiko — besonders bei A7 (öffentliches Deployment).

**Maßnahme:** Vor der Datenerstellung sämtliche Titel und alle Anbieternamen auf klar fiktive Bezeichnungen umstellen. Vorschlag siehe Abschnitt 7.2. Anbieter erhalten erkennbar erfundene Namen im Format `Velora Studios`, `Northgate Play`, `Kessel & Sonne`.

### C5 — Eine Glücksspielsimulation bleibt eine Glücksspielsimulation (High)

Auch ohne Echtgeld übt die Oberfläche Verhaltensmuster ein. Die Forschung zu Social Casinos hält dazu drei Mechaniken für besonders problematisch, und die Anforderung erwähnt keine davon:

- **Near Miss** — zwei Symbole plus knapp verfehltes drittes, betont animiert
- **Losses Disguised as Wins** — Einsatz 1,00, Gewinn 0,40, trotzdem Gewinnfanfare
- **Autoplay und Turbospin** — entkoppelt Entscheidung von Ergebnis

**Maßnahme:** Alle drei werden ausgeschlossen und der Ausschluss dokumentiert. Die Ergebnisanzeige nennt die Nettoveränderung, nicht den Bruttogewinn: bei Einsatz 1,00 und Rückgabe 0,40 steht dort „−0,60 Credits", nicht „Gewinn: 0,40". Das ist ehrlicher als jedes reale Produkt und ein vorzeigbares Merkmal.

### C6 — Kennwörter dürfen nirgends landen (High)

Der Registrierungsflow erhebt Passwort und Bestätigung. In einer LocalStorage-App gibt es keinen sicheren Ort dafür — und Testpersonen tippen erfahrungsgemäß ein echtes, anderswo genutztes Passwort ein.

**Maßnahme:** Das Passwort wird validiert und danach verworfen. Nicht gespeichert, nicht gehasht, nicht geloggt. Persistiert werden ausschließlich Anzeigename und E-Mail. Direkt unter dem Feld steht: *Dieses Passwort wird nicht gespeichert. Bitte trotzdem kein echtes verwenden.*

### C7 — Server-Rendering und LocalStorage vertragen sich nicht automatisch (High)

Der Server kennt das Guthaben nicht. Wird es beim ersten Rendern ausgegeben, gibt es entweder einen Hydration-Mismatch oder ein sichtbares Springen von 1.000,00 auf den echten Wert.

**Maßnahme:** Der State-Provider hält ein `hydrated`-Flag. Vor der Hydration rendern alle zustandsabhängigen Stellen ein Skeleton mit stabilen Abmessungen — nie einen Platzhalterwert. Das gilt für Header-Guthaben, Favoriten-Icons, Session-Timer und alles im Nutzerbereich.

---

## 3. Architektur

### 3.1 Stack-Entscheidung

| Ebene | Wahl | Begründung |
|---|---|---|
| Framework | Next.js, App Router | Die vorgegebene Ordnerstruktur ist bereits App-Router-förmig; statischer Export möglich; Marketing-Seiten profitieren von SSG |
| Sprache | TypeScript, `strict: true` | Ohne `strict` bringen die Typen wenig |
| Styling | Tailwind CSS mit CSS-Custom-Properties als Token-Quelle | Tokens bleiben framework-unabhängig und in DevTools inspizierbar |
| Icons | `lucide-react` | Konsistentes Set, tree-shakeable, gute Default-Größen |
| State | React Context + `useReducer`, nach Domäne getrennt | Kein externer Store nötig; der Reducer erzwingt die Wallet-Invarianten an einer Stelle |
| Persistenz | LocalStorage, ein versionierter Schlüssel | Kein Backend (A1) |
| Formulare | Eigene Validierung mit gemeinsamer Regel-Datei | Eine Bibliothek lohnt sich für vier Formulare nicht |
| Tests | Vitest plus Testing Library | Reducer, Filter, Formatter, Zufallslogik sind ohne Browser testbar |

**Verworfene Alternative:** Vite-SPA. Einfacher, kein Hydration-Problem (C7), aber kein SSG für die öffentlichen Seiten und Abweichung von der vorgegebenen Struktur. **Wechselkriterium:** Wenn kein Wert auf SEO gelegt wird und der Prototyp nie öffentlich indexierbar sein soll, ist Vite die schlankere Wahl. Bitte entscheiden.

### 3.2 Zustandsarchitektur

Vier getrennte Kontexte statt eines Gott-Stores — so lösen Wallet-Updates keine Rerenders in der Lobby aus:

```
SessionContext   Auth-Attrappe, aktueller Nutzer, Rolle, Sessionstart
WalletContext    Guthaben, Bonus, Freispiele, Transaktionen
CatalogContext   Spiele, Favoriten, Filter, Sortierung
RgContext        Spielzeit, Limits, Pause, Selbstsperre
```

**Invarianten, ausschließlich im Wallet-Reducer durchgesetzt:**

1. Kein Guthaben unter null — Einsätze über dem Bestand werden abgelehnt, nicht gekappt
2. Jede Guthabenänderung erzeugt genau eine Transaktion
3. `balanceAfterMinor` einer Transaktion entspricht immer dem Guthaben nach dem Vorgang
4. Bei laufender Runde wird keine zweite angenommen (`roundInFlight`-Guard gegen Doppelklick und Race Conditions)
5. Bei aktiver Selbstsperre oder Pause werden alle einsatzbezogenen Aktionen abgelehnt

Getestet werden diese fünf Regeln direkt gegen den Reducer, ohne UI.

### 3.3 Zufallslogik

Die Anforderung verbietet „nicht dokumentierte Zufallslogik". Konsequenz:

- Ein gesäter PRNG (mulberry32) statt `Math.random()` — damit sind Runden in Tests reproduzierbar
- Pro Spiel eine Konfiguration mit Ergebnisklassen und deren Wahrscheinlichkeiten sowie Multiplikatoren
- Der Erwartungswert der Tabelle ist der ausgewiesene Demo-RTP (C3)
- Die Tabelle ist auf der Detailseite einsehbar — bei einem Demo-Produkt ist das ein Feature, kein Risiko
- Kein Zustand zwischen Runden. Keine „Verlustserie erhöht Gewinnchance"-Logik, weil das eine Falschbehauptung über Glücksspiel einüben würde

### 3.4 Persistenz

Ein Schlüssel, `velora.demo.v1`, Inhalt versioniert:

```
{ schemaVersion: 1, session, wallet, catalogPrefs, rg, admin }
```

Behandelt werden: fehlender Schlüssel (Erstbesuch → Defaults), defektes JSON (verwerfen, Defaults, einmalige Toast-Meldung), unbekannte `schemaVersion` (verwerfen statt raten), belegtes oder deaktiviertes Storage (In-Memory-Fallback mit sichtbarem Hinweis, dass nichts erhalten bleibt). Alle Zugriffe gekapselt in `lib/storage.ts` mit `try/catch` — nirgends sonst wird LocalStorage angefasst. Geschrieben wird gedrosselt, nicht bei jedem Tastendruck.

### 3.5 Routing und Zugriff

| Bereich | Verhalten ohne Berechtigung |
|---|---|
| Öffentlich (`/`, `/casino`, `/game/[id]`, `/promotions`, `/responsible-gaming`, `/help`) | frei |
| Nutzerbereich (`/profile`, `/wallet`, `/history`, `/favorites`, `/bonuses`, `/security`, `/settings`) | Weiterleitung auf `/login?next=…`, danach zurück zum Ziel |
| Admin (`/admin/**`) | Hinweisseite „Für diese Ansicht wird die Demo-Admin-Rolle benötigt" plus direkter Umschalter, siehe C1 |
| Unbekannte Spiel-ID | `not-found` mit Rückweg in die Lobby, kein leerer Bildschirm |
| Aktive Selbstsperre | Spielstart blockiert, Weiterleitung auf Responsible Gaming mit Begründung |

Die Prüfung sitzt in Layouts, nicht in jeder Seite — sonst wird eine vergessen.

### 3.6 Zeitmessung

Session-Timer und Erinnerungen rechnen aus Zeitstempeln, nicht aus Intervall-Zählern. `setInterval` wird in Hintergrund-Tabs gedrosselt und driftet, ein Laptop-Deckel-Zuklappen zerstört jeden Zähler. Bei `visibilitychange` wird neu berechnet.

---

## 4. Designsystem

### 4.1 Richtung

Die Anforderung legt die Farbrichtung fest — der bleibe ich. Frei ist der Charakter, und da meide ich das erwartbare „dunkel plus Goldverlauf plus Glow". Die Leitidee ist **Grand Hotel statt Spielhalle**: viel ruhige Fläche, Gold ausschließlich als schmale Linie und für genau eine Aktion pro Bildschirm, Türkis für alles Informative. Ein Bildschirm hat nie zwei goldene Buttons.

**Signatur:** eine 1 px starke goldene Ober- oder Unterkante an tragenden Flächen — Header, Hero, aktiver Tab, Karte im Hover, Wallet-Panel. Statt Kacheln zum Leuchten zu bringen, zieht das Design eine Linie. Wo Gold auftaucht, ist etwas anfassbar. Das ersetzt das übliche Glühen und bleibt bei `prefers-reduced-motion` unverändert wirksam.

### 4.2 Farbtokens mit geprüften Kontrastwerten

Berechnet nach WCAG 2.1 (relative Luminanz), nicht geschätzt:

| Token | Hex | Verwendung | Kontrast | Ergebnis |
|---|---|---|---|---|
| `--bg-base` | `#0B0D10` | Seitenhintergrund | — | — |
| `--bg-surface` | `#14171C` | Karten, Panels | — | — |
| `--bg-elevated` | `#1C2027` | Modal, Drawer, Popover | — | — |
| `--text-primary` | `#F2F4F7` | Fließtext, Überschriften | 17,66 : 1 auf base | AAA |
| `--text-muted` | `#9AA3AE` | Sekundärtext, Metadaten | 7,03 : 1 auf surface | AAA |
| `--gold` | `#D6A756` | Primäraktion, Signaturlinie | 8,14 : 1 auf surface | AAA |
| `--gold-strong` | `#E3BC77` | Hover, Fokusring | 10,86 : 1 auf base | AAA |
| `--on-gold` | `#0B0D10` | Text auf goldener Fläche | 8,82 : 1 | AAA |
| `--teal` | `#4FD1C5` | Sekundärakzent, Info, Demo-Badge | 9,63 : 1 auf surface | AAA |
| `--success` | `#6EE7B7` | positives Rundenergebnis | 11,78 : 1 auf surface | AAA |
| `--warning` | `#FBBF24` | Limit-Erinnerung | 10,76 : 1 auf surface | AAA |
| `--danger` | `#FCA5A5` | Fehlertext | 9,46 : 1 auf surface | AAA |
| `--border-subtle` | `#2A2F38` | dekorative Trennung | 1,45 : 1 | nur dekorativ, nie alleiniger Träger |
| `--border-control` | `#646C7A` | Eingabefelder, Umrisse | 3,39 : 1 auf surface | erfüllt 1.4.11 (≥ 3 : 1) |

Zwei Werte verdienen Aufmerksamkeit: `--border-subtle` erreicht bewusst keine 3 : 1 und darf deshalb **niemals** die einzige Markierung eines Bedienelements sein — Formularfelder und Umriss-Buttons nutzen ausschließlich `--border-control`. Und `--danger` ist absichtlich das helle Rot: das naheliegende `#EF4444` fällt auf dunklem Grund unter 4,5 : 1.

Violett ist gestrichen. Gold plus Türkis plus Violett ergibt drei konkurrierende Akzente; die Statusfarben brauchen den verbleibenden Farbraum.

### 4.3 Typografie

| Rolle | Schrift | Einsatz |
|---|---|---|
| Display | **Fraunces**, optische Achse auf `soft`, Gewicht 600 | Hero, Sektionsüberschriften, Spielnamen auf der Detailseite |
| Body/UI | **Inter**, 400/500/600 | alles Übrige |
| Tabellen/Zahlen | **Inter** mit `font-variant-numeric: tabular-nums` | Guthaben, Historie, Admin-Kennzahlen |

Die Serif-Display-Schrift ist die eine bewusste Abweichung von der Vorgabe „moderne Sans-Serif". Begründung: durchgängig Inter erzeugt exakt die austauschbare SaaS-Anmutung, die dem Anspruch „hochwertig, luxuriös" widerspricht. Fraunces hat gerade so viel Eigenwilligkeit, dass die Marke greifbar wird, ohne dekorativ zu werden — und sie erscheint nur an großen Stellen, nie in Fließtext oder Bedienelementen. **Falls die Sans-Vorgabe zwingend ist, ist der Ersatz Söhne oder General Sans für Display bei unveränderter Skala.**

Skala (rem): 0,75 / 0,875 / 1 / 1,125 / 1,375 / 1,75 / 2,25 / 3. Zeilenhöhe 1,5 im Fließtext, 1,15 im Display. Zeilenlänge maximal 68 Zeichen.

### 4.4 Weitere Tokens

**Radien:** 8 (Bedienelemente) / 14 (Karten) / 20 (Modal) / 999 (Chips). **Abstände:** 4er-Raster, 4 bis 96. **Schatten:** zwei Stufen, beide niedrigdeckend und weich — auf fast schwarzem Grund tragen Schatten kaum, Tiefe entsteht über die Flächenhelligkeit. **Glas:** ausschließlich auf Header und Bottom-Nav, `backdrop-blur` mit deckendem Fallback, weil Blur auf schwachen Geräten teuer ist.

**Bewegung:** 120 ms für Zustandswechsel, 200 ms für Ein-/Ausblendungen, 320 ms für Drawer und Modal, `ease-out`. Bei `prefers-reduced-motion: reduce` bleiben Deckkraftwechsel, entfallen Transformationen — der Wechsel ist damit weiterhin wahrnehmbar, nur ohne Bewegung.

**Fokus:** durchgängig `2px solid var(--gold-strong)` mit 2 px Abstand, nie entfernt, auch nicht auf goldenen Flächen (dort auf `--text-primary` umgestellt, da Gold auf Gold verschwindet).

### 4.5 Demo-Kennzeichnung als Systembestandteil

Kein einzelnes Banner, sondern drei feste Ebenen:

1. **Streifen** ganz oben auf jeder Seite, nicht schließbar, Türkis auf dunkel: *Demo-Prototyp — kein Echtgeldspiel, keine Auszahlungen*
2. **Badge** an jeder Zahl mit Geldbezug: Guthaben, Einsatz, Ergebnis, Bonus tragen die Einheit „Credits" und im Header das Kürzel „DEMO"
3. **Kontexthinweis** vor jeder Aktion, die im Echtgeldprodukt Geld bewegen würde — Runde starten, Bonus aktivieren, Credits hinzufügen

Ebene 1 ist nicht ausblendbar. Ein schließbarer Hinweis ist nach dem ersten Klick unsichtbar, und genau dann wird er gebraucht.

---

## 5. Datenmodell

Gegenüber der Vorlage geändert; jede Änderung begründet.

```ts
// types/money.ts
/** Ganzzahlige Hundertstel Credits. 1050 = 10,50 Credits. Siehe C2. */
export type CreditsMinor = number;

// types/game.ts
export type GameCategory =
  | "slots" | "roulette" | "blackjack" | "baccarat"
  | "poker" | "arcade" | "gameshow" | "live";

export type Volatility = "low" | "medium" | "high";

export type Game = {
  id: string;
  slug: string;
  name: string;
  category: GameCategory;
  providerId: string;              // statt freiem String: Referenz auf providers.ts
  description: string;
  thumbnail: string;
  thumbnailAlt: string;            // neu: Alternativtext gehört zum Datensatz, nicht in die Komponente
  banner?: string;
  tags: string[];
  demoDifficulty: "easy" | "medium" | "advanced";  // neu: die Anforderung verlangt diesen Filter
  rtpDemo?: number;                // nur gesetzt, wenn eine geprüfte Auszahlungstabelle existiert (C3)
  volatility?: Volatility;
  minDemoBetMinor: CreditsMinor;
  maxDemoBetMinor: CreditsMinor;
  isNew: boolean;
  isPopular: boolean;
  isFeatured: boolean;
  isLiveDemo: boolean;
  status: "active" | "inactive";
  releasedAt: string;              // neu: „Neu"-Sortierung braucht ein Datum, kein Boolean
  popularityScore: number;         // neu: „Beliebtheit"-Sortierung braucht einen Wert
};
```

**Warum:** `provider` als freier String führt garantiert zu „NetGold" neben „Netgold" und zerlegt den Anbieterfilter. `isNew` und `isPopular` sind Anzeige-Badges und taugen nicht zum Sortieren — die Anforderung verlangt aber Sortierung nach Neuheit und Beliebtheit. `thumbnailAlt` gehört zu den Daten, weil sonst jede Komponente ihren eigenen, meist schlechten Alternativtext erfindet.

```ts
// types/user.ts
export type User = {
  id: string;
  displayName: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  // kein Passwortfeld, in keiner Form. Siehe C6.
};

// types/wallet.ts
export type Wallet = {
  demoBalanceMinor: CreditsMinor;
  bonusBalanceMinor: CreditsMinor;
  freeSpins: number;               // neu, siehe L1
  roundInFlight: boolean;          // Doppelklick- und Race-Guard
};

// types/responsible-gaming.ts
export type ResponsibleGaming = {
  sessionStartedAt: string;
  sessionLimitMinutes?: number;
  reminderIntervalMinutes: number;
  pausedUntil?: string;
  selfExcluded: boolean;
  lastReminderAt?: string;
};

// types/transaction.ts
export type TransactionType =
  | "demo_credit" | "demo_bet" | "demo_win"
  | "bonus_grant" | "free_spin" | "reset";

export type Transaction = {
  id: string;
  seq: number;                     // neu: garantiert Reihenfolge, siehe L6
  userId: string;
  type: TransactionType;
  amountMinor: CreditsMinor;       // Vorzeichen: Einsatz negativ, Gutschrift positiv
  balanceAfterMinor: CreditsMinor;
  gameId?: string;
  roundId?: string;                // neu: verbindet Einsatz und Ergebnis derselben Runde
  createdAt: string;
  isDemo: true;
};
```

**Warum:** `demo_result` war mehrdeutig — ein Ergebnis kann Gewinn oder Nullrunde sein, und Einsatz und Ergebnis sind zwei Buchungen. Ohne `roundId` lässt sich in der Historie nicht erkennen, welcher Einsatz zu welchem Ergebnis gehört. `seq` ersetzt die Sortierung nach Zeitstempel, die bei zwei Buchungen in derselben Millisekunde versagt.

```ts
// types/game-round.ts
export type RoundStatus =
  | "idle" | "loading" | "ready" | "playing"
  | "paused" | "finished" | "error";

export type RoundOutcome = {
  roundId: string;
  gameId: string;
  stakeMinor: CreditsMinor;
  returnMinor: CreditsMinor;       // Rückgabe, nicht „Gewinn"
  netMinor: CreditsMinor;          // returnMinor - stakeMinor, das ist die angezeigte Zahl (C5)
  outcomeKey: string;              // Verweis in die dokumentierte Auszahlungstabelle
  seed: number;                    // macht die Runde reproduzierbar
};
```

---

## 6. Komponentenarchitektur

### 6.1 Schichten

```
app/            Routen, Layouts, Server-Komponenten wo möglich
components/ui/  primitiv, zustandslos: Button, Input, Badge, Card, Modal, Toast, Skeleton
components/     fachlich: GameCard, GameGrid, FilterDrawer, DemoWallet, PromoCard, RgPanel
lib/            reine Funktionen: filters, formatters, validation, rng, paytables, storage
data/           typisierte Mock-Daten, einzige Quelle
types/          gemeinsame Typen
state/          Provider und Reducer
```

**Regel:** `lib/` importiert nichts aus `components/`. `data/` importiert nur aus `types/`. Alles unter `components/ui/` kennt keine Fachlogik. Das ist per Lint-Regel durchsetzbar und verhindert die schleichende Vermischung, an der solche Projekte im dritten Monat scheitern.

### 6.2 Wiederverwendung statt Wiederholung

Die Anforderung verbietet hartkodierte Spielkarten in mehreren Komponenten. Konkret: `GameCard` existiert einmal, in drei Varianten (`default`, `compact`, `featured`) über eine Prop — nicht als drei Komponenten. Startseiten-Reihen, Lobby-Raster, „Ähnliche Spiele" und Favoriten nutzen dieselbe Komponente.

Ebenso: ein `EmptyState` mit Props für Icon, Titel, Text und Aktion deckt alle acht Leerzustände ab. Ein `AsyncBoundary` kapselt Laden, Fehler und Wiederholung und wird um jeden datenabhängigen Bereich gelegt.

### 6.3 Filterlogik

`lib/filters.ts` enthält eine reine Funktion `applyFilters(games, criteria): Game[]` ohne React-Bezug. Damit ist die komplette Lobby-Logik ohne Rendering testbar — Suche mit Sonderzeichen, leeres Ergebnis, kombinierte Filter, Reset. Die Filterkriterien liegen in der URL (`?q=&cat=&provider=&sort=`), nicht nur im State: dadurch sind Suchergebnisse teilbar, der Zurück-Button funktioniert erwartungsgemäß und ein Reload verliert nichts.

Die Suche wird mit 200 ms Verzögerung ausgelöst und normalisiert Groß-/Kleinschreibung sowie Umlaute, damit „Grun" auch „Grün" findet.

---

## 7. Mock-Daten

### 7.1 Aufbau

Drei Dateien: `data/games.ts` (22 Einträge), `data/providers.ts` (6), `data/promotions.ts` (3). Zusätzlich `data/paytables.ts` mit einer Auszahlungstabelle je spielbarem Titel, und `data/mock-history.ts` für vorbefüllte Historie und Admin-Kennzahlen — sonst sind alle Tabellen beim ersten Start leer und der Prototyp wirkt kaputt. Vorbefüllte Einträge werden als Beispieldaten gekennzeichnet.

### 7.2 Titel

**Abweichung, siehe C4.** Vorschlag für die Umbenennung der kritischen Titel, gleiche Anzahl und Verteilung:

| Vorlage | Ersatz |
|---|---|
| Book of Fortune | Codex Aurelia |
| Gold Rush | Kupferschacht |
| Moon Princess | Lunara Drift |
| Wild West | Staubpfad |
| Dragon's Treasure | Zunderschuppe |
| Egyptian Gold | Sandkönigin |
| Pirate Treasure | Salzwind |

Unkritisch und unverändert: Classic Fruit, Neon Nights, Mystic Jungle, Candy Spin, Luxury 7s, die Tischspiele, Plinko/Mines/Dice/Wheel Demo sowie die drei Live-Demos.

### 7.3 Bilder

Keine Fotos realer Personen — auch nicht im Live-Dealer-Bereich (Persönlichkeitsrechte). Vorschlag: abstrakte, generierte Motive in der Farbwelt des Designsystems, plus ein deterministischer Fallback, der aus dem Spielnamen eine Initialen-Kachel mit Kategoriefarbe erzeugt. Damit ist der Zustand „Bild fehlt" nie hässlich und die Bildbeschaffung wird nicht zum Blocker.

---

## 8. Fehler-, Leer- und Ladezustände

Alle geforderten Zustände mit Zuordnung. Jede Meldung folgt dem Muster **Was ist passiert → Was jetzt tun**, in der Stimme der Oberfläche, ohne Entschuldigung und ohne Stacktrace.

| Zustand | Darstellung | Handlungsoption |
|---|---|---|
| Keine Spiele gefunden | `EmptyState` in der Rasterfläche, Filter bleiben sichtbar | „Filter zurücksetzen", zusätzlich drei Vorschläge |
| Spielbild nicht verfügbar | Fallback-Kachel (7.3), Layout unverändert | keine |
| Spiel deaktiviert | Karte gedimmt mit Badge „Zurzeit nicht verfügbar", Detailseite erreichbar, Startknopf inaktiv | „Ähnliche Spiele ansehen" |
| Guthaben reicht nicht | Inline am Einsatzfeld, nicht als Modal | „Demo-Credits hinzufügen" / „Guthaben zurücksetzen" |
| Session abgelaufen | Modal beim nächsten Interagieren | „Erneut anmelden" mit Rückkehr zur Ausgangsseite |
| Nicht angemeldet | Weiterleitung mit `next`-Parameter | Anmelden oder Registrieren |
| Admin ohne Rolle | eigene Seite, siehe C1 | „Demo-Admin-Rolle aktivieren" |
| Ungültige Eingabe | Inline unter dem Feld, `aria-describedby`, Fokus auf das erste fehlerhafte Feld | Feldbezogener Hinweis |
| Mehrfaches Absenden | Button während der Verarbeitung inaktiv plus Idempotenz über `roundInFlight` | keine |
| Langsames Laden | Skeleton in exakter Zielgröße, ab 3 s zusätzlich Text | „Abbrechen" wo sinnvoll |
| Simulierter Serverfehler | `ErrorState` im betroffenen Bereich, restliche Seite bleibt bedienbar | „Erneut versuchen" |
| Leere Historie | `EmptyState` | „Zur Lobby" |
| Leere Favoriten | `EmptyState` mit drei Empfehlungen | „Spiele entdecken" |
| Ungültige Spiel-ID | `not-found`-Route | „Zur Lobby" plus Suchfeld |
| LocalStorage fehlt oder ist defekt | Toast beim Start, App läuft im Speicher weiter | Hinweis, dass nichts erhalten bleibt |
| Selbstsperre aktiv | Startknopf inaktiv mit Begründung | „Zu Responsible Gaming" |

**Bewusst kein Modal** bei unzureichendem Guthaben und bei Filterergebnissen. Ein Modal unterbricht, obwohl der Nutzer genau weiß, was er tun will — Inline-Meldungen sind an dieser Stelle schneller und weniger bevormundend.

---

## 9. Responsive Verhalten

Haltepunkte: 360 / 640 / 768 / 1024 / 1280 / 1536. Untere Testgrenze ist 320 px Breite.

| Bereich | Mobil | Tablet | Desktop |
|---|---|---|---|
| Navigation | feste Bottom-Nav mit fünf Zielen, Header nur Logo, Suche, Guthaben | Bottom-Nav bis 767, darüber horizontale Navigation | volle Navigation im Header |
| Spielraster | 2 Spalten | 3 | 4 bis 6 |
| Filter | Vollbild-Drawer von unten, mit Übernehmen/Zurücksetzen | Drawer von der Seite | feste Spalte links |
| Historie | Kartenliste | Tabelle mit reduzierten Spalten | volle Tabelle |
| Wallet | eigene Seite | zweispaltig | Seitenpanel plus Historie |
| Admin | Warnhinweis „für größere Bildschirme optimiert", Listen bleiben lesbar | eingeschränkt | vollständig |

Bottom-Nav respektiert `env(safe-area-inset-bottom)`. Alle Touch-Ziele mindestens 44 × 44 px, auch das Favoriten-Herz auf der Karte — das ist der typische Kandidat für 24 px und daneben getroffene Spielstarts. Kein horizontales Scrollen bei 320 px; die Karussells der Startseite scrollen bewusst horizontal, mit sichtbarer Kante als Hinweis und Tastaturbedienung.

---

## 10. Abnahmetests

### 10.1 Automatisiert prüfbar

| # | Prüfung | Ebene |
|---|---|---|
| 1 | Einsatz über Guthaben wird abgelehnt, Kontostand unverändert | Reducer |
| 2 | Guthaben wird nie negativ, über 500 zufällige Aktionsfolgen | Reducer, Property-Test |
| 3 | `balanceAfterMinor` stimmt nach jeder Transaktionskette | Reducer |
| 4 | Doppelter Rundenstart erzeugt genau eine Buchung | Reducer |
| 5 | Auszahlungstabelle trifft den ausgewiesenen RTP, 100.000 Runden je Spiel | `lib/rng` |
| 6 | Filterkombinationen liefern erwartete Mengen, inklusive Leermenge | `lib/filters` |
| 7 | Suche findet unabhängig von Groß-/Kleinschreibung und Umlauten | `lib/filters` |
| 8 | Beträge werden korrekt formatiert, inklusive 0 und Maximalwert | `lib/formatters` |
| 9 | Formularvalidierung: leer, ungültige E-Mail, zu kurzes Passwort, Nichtübereinstimmung | `lib/validation` |
| 10 | Defektes und fehlendes LocalStorage führen zu sauberen Defaults | `lib/storage` |
| 11 | Aktive Selbstsperre blockiert alle einsatzbezogenen Aktionen | Reducer |
| 12 | Kein Passwort landet im persistierten State | Reducer, Regressionstest zu C6 |

### 10.2 Manuell zu prüfen

Startseite auf Desktop und bei 320 px; Spiel suchen, filtern, favorisieren; Demo-Spiel starten und Guthabenverlauf nachvollziehen; Runde bei zu wenig Guthaben blockieren; Guthaben zurücksetzen; Historie prüfen; Registrierung und Logout; Responsible-Gaming-Pause aktivieren und den Spielstart als blockiert bestätigen; Admin ohne Rolle; Spiel im Admin deaktivieren und Wirkung in der Lobby prüfen; ungültige Spiel-ID aufrufen; komplette Tastaturbedienung ohne Maus einschließlich Modal und Drawer; `prefers-reduced-motion`; Reload auf jeder Route ohne Zustandsverlust.

### 10.3 Qualitäts-Gates

Freigabe erst, wenn alle Punkte aus 10.1 grün sind, alle aus 10.2 abgehakt sind, kein Critical- oder High-Befund offen ist, `tsc --noEmit` und der Linter fehlerfrei durchlaufen und die Kontrastwerte aus 4.2 in der gebauten Anwendung stichprobenhaft nachgemessen wurden.

---

## 11. Was vor einer Echtgeldversion zu klären wäre

Ausdrücklich **nicht** Teil des Prototyps. Nur zur Einordnung, ohne Anspruch auf Vollständigkeit und ohne Rechtsberatung — dafür braucht es eine auf Glücksspielrecht spezialisierte Kanzlei:

**Rechtlich:** Lizenz der zuständigen Aufsichtsbehörde je Zielmarkt; in Deutschland Glücksspielstaatsvertrag samt Erlaubnis der GGL, mit Einsatz- und Einzahlungsgrenzen, Panikknopf, Anschluss an die Sperrdatei OASIS und Beschränkungen für Werbung. Steuerliche Behandlung von Einsätzen. Vertragswerk und AGB je Rechtsraum. Geoblocking für nicht lizenzierte Märkte.

**Regulatorisch und organisatorisch:** Identitäts- und Altersprüfung vor der ersten Einzahlung; Geldwäscheprävention mit Sorgfaltspflichten, Monitoring und Meldewegen; zertifizierte Zufallsgenerierung und Spielprüfung durch ein akkreditiertes Testlabor; Sozialkonzept, geschultes Personal, dokumentierte Prozesse für Spielerschutz und Beschwerden.

**Technisch:** serverautoritative Spiellogik — kein Ergebnis darf im Client entstehen; auditierbares, unveränderliches Transaktionsjournal; echte Server-Authentifizierung mit Autorisierung, Mehrfaktor und Sitzungsverwaltung; PCI-DSS-Rahmen für Zahlungen; Datenschutzkonzept nach DSGVO mit Rechtsgrundlagen, Löschfristen und Auftragsverarbeitung; Betrugserkennung, Bonusmissbrauchserkennung, Verfügbarkeits- und Notfallkonzept; Penetrationstests durch Dritte.

Der Abstand zwischen diesem Prototyp und einem genehmigungsfähigen Produkt ist erheblich. Der Prototyp ersetzt keinen Schritt davon.

---

## 12. Risiken, Grenzen und offene Entscheidungen

### 12.1 Nicht verifiziert

Ehrlich gesagt und nicht behauptet:

- **Visuelles Erscheinungsbild.** Ich kann nichts rendern und nichts ansehen. Die Palette ist rechnerisch geprüft, ihre Wirkung nicht.
- **Ladezeiten, Bundle-Größe, Core Web Vitals.** Keine Messung ohne Build und Browser.
- **Screenreader-Verhalten.** ARIA-Struktur lässt sich planen, das Vorlesen nicht simulieren. Ein Durchgang mit NVDA oder VoiceOver bleibt nötig.
- **Cross-Browser- und Realgeräteverhalten**, insbesondere Safari mit `backdrop-blur` und Safe-Area.
- **Tatsächliche RTP-Werte.** Die Tabellen existieren noch nicht; Test 10.1/5 kann erst nach der Implementierung laufen.
- **Verhalten unter Last.** Bei einer clientseitigen App weitgehend irrelevant, aber ungetestet.

### 12.2 Bekannte Restrisiken

| Risiko | Priorität | Umgang |
|---|---|---|
| Admin-Bereich ist keine Sicherheitsgrenze | Critical | offen kommuniziert, siehe C1 |
| Prototyp könnte für ein echtes Angebot gehalten werden | High | dreistufige Kennzeichnung (4.5), `noindex` empfohlen |
| Spielsimulation kann Verhalten einüben | High | Near Miss, LDW und Autoplay ausgeschlossen (C5), Nettodarstellung |
| Umbenannte Titel könnten weiterhin an reale Marken erinnern | Medium | Prüfung der finalen Liste vor Deployment |
| LocalStorage in privaten Fenstern oder bei blockiertem Storage | Medium | In-Memory-Fallback mit Hinweis |
| Umfang übersteigt eine sinnvolle Prototyp-Iteration | High | Schnitt nach M1/M2/M3 (1.6) |

### 12.3 Zu entscheiden vor Phase 4

1. **Stack:** Next.js wie vorgeschlagen, oder Vite-SPA als schlankere Variante ohne SEO? (3.1)
2. **Display-Schrift:** Fraunces als Serif-Akzent, oder streng Sans wie in der Vorgabe? (4.3)
3. **Spieltitel:** Umbenennung nach 7.2 freigegeben? (C4)
4. **Umfang:** Start mit M1, oder alle drei Iterationen in einem Zug? (1.6)
5. **Ergebnisdarstellung:** Netto statt brutto, auch wenn das unüblich wirkt? (C5)
6. **Admin-Rolle:** offener Umschalter statt simuliertem Login? (C1)

---

## 13. Empfehlung zum aktuellen Stand

**Bedingt bereit** — für den Übergang in Phase 4, nicht als Produkt.

Anforderungen, Architektur, Datenmodell, Designsystem, Zustandslogik und Testplan sind vollständig genug, dass die Implementierung ohne Rätselraten beginnen kann. Die sechs Entscheidungen aus 12.3 sollten vorher fallen; drei davon (C2, C3, C4) betreffen Datenmodell und Datenbestand und sind später deutlich teurer zu korrigieren.

Was jetzt nicht behauptet wird: dass die Anwendung gut aussieht, schnell lädt oder barrierefrei ist. Das steht erst nach Phase 5 bis 7 fest.
