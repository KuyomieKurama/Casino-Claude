# Implementierungs-Prompt — Velora Casino Demo

> Gedacht für einen Coding-Agent mit Dateisystemzugriff (Claude Code, Cursor, Cowork).
> Alles unterhalb dieser Zeile ist der Prompt.

---

## Rolle

Du bist Senior Full-Stack-Entwickler und implementierst einen bereits konzipierten Frontend-Prototypen. Konzept, Architektur, Datenmodell und Designsystem stehen fest und sind unten vollständig enthalten. Deine Aufgabe ist die Umsetzung, nicht die Neukonzeption.

Weiche nur ab, wenn du einen konkreten Fehler in der Vorgabe findest. Dann benenne ihn, begründe ihn und schlage die Korrektur vor, bevor du sie umsetzt.

---

## Auftrag

Baue **Velora Casino Demo** — einen klickbaren Prototypen einer Casino-Lobby mit simuliertem Guthaben, simuliertem Login und Mock-Admin-Bereich. Zweck ist die Demonstration von UI, UX und Informationsarchitektur.

Der Produktname steht an genau einer Stelle in einer Konstante und muss durch Ändern dieser Zeile austauschbar sein.

---

## 0. Vorentscheidungen (jede in einer Zeile umschaltbar)

| # | Entscheidung | Gesetzt auf | Alternative |
|---|---|---|---|
| E1 | Stack | Next.js App Router | Vite-SPA, falls SEO irrelevant |
| E2 | Display-Schrift | Fraunces (Serif) als Akzent | streng Sans (Söhne / General Sans) |
| E3 | Spieltitel | umbenannt, siehe §10 | Originaltitel — **nicht empfohlen**, Markenrisiko |
| E4 | Umfang | nur M1 (§14), dann Freigabe abwarten | M1–M3 am Stück |
| E5 | Ergebnisdarstellung | netto (`−0,60 Credits`) | brutto |
| E6 | Admin-Rolle | offener Umschalter in den Einstellungen | simulierter Admin-Login |

Wenn dir eine dieser Zeilen im Auftrag anders vorgegeben wird, gilt die Vorgabe.

---

## 1. Harte Regeln

Diese Punkte sind nicht verhandelbar. Verstöße sind Abbruchgründe, keine Schönheitsfehler.

1. **Kein Echtgeld.** Keine Zahlungsanbindung, keine Kreditkartenfelder, keine Wallet-Adressen, keine Auszahlung, keine externen Glücksspiel- oder Zahlungs-APIs.
2. **Keine falschen Versprechen.** Keine Lizenzangaben, keine Gewinngarantien, keine echten Quoten, keine künstliche Verknappung, keine Countdown-Timer mit Druckwirkung.
3. **Kein KYC, keine Altersprüfung, keine Identitätsdaten** — stattdessen ein erklärender Hinweis, dass ein Echtgeldprodukt diese Mechanismen rechtsraumabhängig benötigt.
4. **Geld ist ganzzahlig.** Alle Beträge intern als `CreditsMinor` (Hundertstel Credits, `1050` = 10,50). Formatierung ausschließlich über `formatCredits()` an der UI-Grenze. Nie `float` für Guthaben.
5. **Kein Passwort wird gespeichert** — nicht im Klartext, nicht gehasht, nicht geloggt, nicht in LocalStorage, nicht im State. Validieren, dann verwerfen. Unter dem Feld steht: *Dieses Passwort wird nicht gespeichert. Bitte trotzdem kein echtes verwenden.*
6. **Ausgewiesener RTP muss der Auszahlungstabelle entsprechen.** Spiele ohne verifizierte Tabelle zeigen keinen RTP-Wert. Siehe §6.
7. **Keine Dark Patterns.** Ausdrücklich verboten und im Code zu kommentieren:
   - kein *Near Miss* (knapp verfehltes Ergebnis wird nicht betont)
   - kein *Loss Disguised as Win* (Rückgabe unter Einsatz wird nie als Gewinn gefeiert)
   - kein Autoplay, kein Turbospin
   - keine vorausgewählten Bonusoptionen
   - keine versteckten Pause- oder Logout-Funktionen
   - kein Ton ohne explizite Aktivierung
8. **Keine realen Marken.** Spieltitel und Anbieternamen sind frei erfunden (§10). Keine Fotos realer Personen, auch nicht im Live-Dealer-Bereich.
9. **Zufallslogik ist dokumentiert.** Kein `Math.random()` in Spiellogik, kein Zustand zwischen Runden, keine „Verlustserie erhöht Gewinnchance"-Mechanik.
10. **Demo-Kennzeichnung dreistufig** (§8.5), Ebene 1 ist nicht ausblendbar.

---

## 2. Stack

- Next.js, App Router, TypeScript mit `strict: true`
- Tailwind CSS, alle Farben und Maße als CSS-Custom-Properties in `app/globals.css`, Tailwind referenziert nur diese Variablen
- `lucide-react` für Icons
- State: React Context plus `useReducer`, nach Domäne getrennt — kein externer Store
- Persistenz: LocalStorage, ein versionierter Schlüssel
- Tests: Vitest plus Testing Library
- Kein Backend, keine Datenbank, keine externen Requests zur Laufzeit

---

## 3. Projektstruktur

```
app/
  layout.tsx  page.tsx  not-found.tsx
  casino/  game/[slug]/  live-casino/  promotions/
  responsible-gaming/  help/
  login/  register/
  (user)/profile/  wallet/  history/  favorites/  bonuses/  security/  settings/
  admin/  admin/games/  admin/users/  admin/content/
components/
  ui/        Button Input Select Checkbox Badge Card Modal Drawer Toast Skeleton Tabs Tooltip
  layout/    Header BottomNavigation Footer DemoBanner
  game/      GameCard GameGrid CategoryTabs SearchBar FilterDrawer GameRow
  wallet/    DemoWallet BalanceDisplay TransactionList
  feedback/  EmptyState ErrorState AsyncBoundary
  rg/        SessionTimer RgPanel LimitDialog
data/        games.ts providers.ts promotions.ts paytables.ts mock-history.ts
lib/         filters.ts formatters.ts validation.ts rng.ts storage.ts constants.ts
state/       SessionContext.tsx WalletContext.tsx CatalogContext.tsx RgContext.tsx
types/       game.ts user.ts wallet.ts transaction.ts game-round.ts money.ts
```

**Schichtregeln, per ESLint durchsetzen:**
- `lib/` importiert nichts aus `components/` oder `app/`
- `data/` importiert nur aus `types/`
- `components/ui/` enthält keine Fachlogik und kennt keinen Context
- LocalStorage wird ausschließlich in `lib/storage.ts` angefasst

---

## 4. Designsystem

### Farbtokens

Exakt diese Werte verwenden. Die Kontrastwerte sind nach WCAG 2.1 berechnet, nicht geschätzt.

```css
--bg-base:        #0B0D10;  /* Seitenhintergrund */
--bg-surface:     #14171C;  /* Karten, Panels */
--bg-elevated:    #1C2027;  /* Modal, Drawer, Popover */
--text-primary:   #F2F4F7;  /* 17,66:1 auf base — AAA */
--text-muted:     #9AA3AE;  /*  7,03:1 auf surface — AAA */
--gold:           #D6A756;  /*  8,14:1 auf surface — AAA */
--gold-strong:    #E3BC77;  /* 10,86:1 auf base — Hover + Fokusring */
--on-gold:        #0B0D10;  /*  8,82:1 auf gold — Text auf goldener Fläche */
--teal:           #4FD1C5;  /*  9,63:1 — Sekundärakzent, Info, Demo-Badge */
--success:        #6EE7B7;  /* 11,78:1 */
--warning:        #FBBF24;  /* 10,76:1 */
--danger:         #FCA5A5;  /*  9,46:1 — bewusst hell; #EF4444 fällt unter 4,5:1 */
--border-subtle:  #2A2F38;  /*  1,45:1 — REIN DEKORATIV, nie alleinige Markierung */
--border-control: #646C7A;  /*  3,39:1 — Eingabefelder, Umriss-Buttons (WCAG 1.4.11) */
```

Kein Violett. Gold plus Türkis plus Violett ergibt drei konkurrierende Akzente.

### Gestaltungsregeln

- **Gold ist knapp.** Ein Bildschirm hat höchstens eine goldene Fläche — die Primäraktion. Alles andere ist Umriss oder Text.
- **Signatur:** eine 1 px starke goldene Ober- oder Unterkante an tragenden Flächen (Header, Hero, aktiver Tab, Karte im Hover, Wallet-Panel). Wo Gold als Linie auftaucht, ist etwas anfassbar. **Kein Glühen, keine Verläufe auf Kacheln.**
- Leitidee: **Grand Hotel statt Spielhalle.** Viel ruhige Fläche, klare Hierarchie, keine Effekte ohne Zweck.

### Typografie

| Rolle | Schrift | Einsatz |
|---|---|---|
| Display | Fraunces, `soft`, 600 | Hero, Sektionsüberschriften, Spielname auf der Detailseite |
| Body/UI | Inter 400/500/600 | alles Übrige |
| Zahlen | Inter mit `font-variant-numeric: tabular-nums` | Guthaben, Historie, Kennzahlen |

Skala (rem): 0,75 / 0,875 / 1 / 1,125 / 1,375 / 1,75 / 2,25 / 3. Zeilenhöhe 1,5 im Fließtext, 1,15 im Display. Zeilenlänge maximal 68 Zeichen. Display-Schrift nie in Fließtext oder Bedienelementen.

### Weitere Tokens

Radien 8 / 14 / 20 / 999. Abstände im 4er-Raster. Zwei niedrigdeckende Schattenstufen. `backdrop-blur` nur auf Header und Bottom-Nav, mit deckendem Fallback.

**Bewegung:** 120 ms Zustandswechsel, 200 ms Ein-/Ausblenden, 320 ms Drawer und Modal, `ease-out`. Bei `prefers-reduced-motion: reduce` bleiben Deckkraftwechsel, entfallen Transformationen.

**Fokus:** durchgängig `2px solid var(--gold-strong)` mit 2 px Abstand, nie entfernt. Auf goldenen Flächen auf `--text-primary` umstellen.

---

## 5. Datenmodell

```ts
// types/money.ts
/** Ganzzahlige Hundertstel Credits. 1050 = 10,50 Credits. */
export type CreditsMinor = number;

// types/game.ts
export type GameCategory =
  | "slots" | "roulette" | "blackjack" | "baccarat"
  | "poker" | "arcade" | "gameshow" | "live";

export type Game = {
  id: string;
  slug: string;
  name: string;
  category: GameCategory;
  providerId: string;              // Referenz auf providers.ts, kein freier String
  description: string;
  thumbnail: string;
  thumbnailAlt: string;            // Alternativtext gehört zu den Daten
  banner?: string;
  tags: string[];
  demoDifficulty: "easy" | "medium" | "advanced";
  rtpDemo?: number;                // nur bei geprüfter Auszahlungstabelle
  volatility?: "low" | "medium" | "high";
  minDemoBetMinor: CreditsMinor;
  maxDemoBetMinor: CreditsMinor;
  isNew: boolean;
  isPopular: boolean;
  isFeatured: boolean;
  isLiveDemo: boolean;
  status: "active" | "inactive";
  releasedAt: string;              // Sortierung „Neuheit"
  popularityScore: number;         // Sortierung „Beliebtheit"
};

// types/user.ts
export type User = {
  id: string;
  displayName: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  // kein Passwortfeld, in keiner Form
};

// types/wallet.ts
export type Wallet = {
  demoBalanceMinor: CreditsMinor;
  bonusBalanceMinor: CreditsMinor;
  freeSpins: number;
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
  seq: number;                     // monoton, garantiert Reihenfolge
  userId: string;
  type: TransactionType;
  amountMinor: CreditsMinor;       // Einsatz negativ, Gutschrift positiv
  balanceAfterMinor: CreditsMinor;
  gameId?: string;
  roundId?: string;                // verbindet Einsatz und Ergebnis derselben Runde
  createdAt: string;
  isDemo: true;
};

// types/game-round.ts
export type RoundStatus =
  | "idle" | "loading" | "ready" | "playing"
  | "paused" | "finished" | "error";

export type RoundOutcome = {
  roundId: string;
  gameId: string;
  stakeMinor: CreditsMinor;
  returnMinor: CreditsMinor;       // Rückgabe, nicht „Gewinn"
  netMinor: CreditsMinor;          // returnMinor − stakeMinor, das ist die angezeigte Zahl
  outcomeKey: string;              // Verweis in die Auszahlungstabelle
  seed: number;                    // macht die Runde reproduzierbar
};
```

---

## 6. Zustandslogik und Zufall

### Kontexte

`SessionContext` (Auth-Attrappe, Nutzer, Rolle) · `WalletContext` (Guthaben, Transaktionen) · `CatalogContext` (Spiele, Favoriten, Filter) · `RgContext` (Spielzeit, Limits, Pause, Sperre). Getrennt, damit Wallet-Updates keine Rerenders in der Lobby auslösen.

### Invarianten — ausschließlich im Wallet-Reducer, nirgends in der UI

1. Guthaben wird nie negativ. Einsätze über dem Bestand werden **abgelehnt**, nicht gekappt.
2. Jede Guthabenänderung erzeugt genau eine Transaktion.
3. `balanceAfterMinor` entspricht immer dem Guthaben nach dem Vorgang.
4. Bei `roundInFlight === true` wird keine zweite Runde angenommen.
5. Bei aktiver Selbstsperre oder Pause werden alle einsatzbezogenen Aktionen abgelehnt.

### Zufallslogik

- Gesäter PRNG (mulberry32) in `lib/rng.ts`, `Math.random()` nur für den Startseed
- Pro spielbarem Titel eine Auszahlungstabelle in `data/paytables.ts` mit Ergebnisklassen, Wahrscheinlichkeiten und Multiplikatoren
- Der Erwartungswert der Tabelle **ist** der angezeigte `rtpDemo`
- Die Tabelle ist auf der Detailseite einsehbar

**Referenztabelle für Neon Nights, Demo-RTP 95,0 %:**

| Ergebnis | Multiplikator | Wahrscheinlichkeit | Beitrag |
|---|---|---|---|
| Nullrunde | 0× | 0,505 | 0,000 |
| Teilrückgabe | 0,5× | 0,200 | 0,100 |
| Einsatz zurück | 1× | 0,150 | 0,150 |
| Kleiner Treffer | 2× | 0,090 | 0,180 |
| Treffer | 5× | 0,036 | 0,180 |
| Großer Treffer | 10× | 0,014 | 0,140 |
| Serie | 25× | 0,004 | 0,100 |
| Höchstgewinn | 100× | 0,001 | 0,100 |
| **Summe** | | **1,000** | **0,950** |

### Zeitmessung

Session-Timer und Erinnerungen rechnen aus Zeitstempeln, nie aus Intervall-Zählern. Bei `visibilitychange` neu berechnen.

### Persistenz

Ein Schlüssel `velora.demo.v1`, Inhalt mit `schemaVersion`. Zu behandeln: fehlender Schlüssel (Defaults), defektes JSON (verwerfen, Defaults, einmaliger Toast), unbekannte Version (verwerfen statt raten), blockiertes oder volles Storage (In-Memory-Fallback mit sichtbarem Hinweis, dass nichts erhalten bleibt). Schreiben gedrosselt, nicht bei jedem Tastendruck.

### Hydration

Der State-Provider hält ein `hydrated`-Flag. Vor der Hydration rendern alle zustandsabhängigen Stellen ein Skeleton mit stabilen Abmessungen — **nie einen Platzhalterwert wie 1.000,00**. Betrifft Header-Guthaben, Favoriten-Icons, Session-Timer und den gesamten Nutzerbereich.

---

## 7. Routing und Zugriff

| Bereich | Ohne Berechtigung |
|---|---|
| Öffentlich (`/`, `/casino`, `/game/[slug]`, `/promotions`, `/responsible-gaming`, `/help`) | frei |
| Nutzerbereich | Weiterleitung auf `/login?next=…`, danach zurück zum Ziel |
| `/admin/**` | Hinweisseite mit direktem Umschalter „Demo-Admin-Ansicht aktivieren" |
| Unbekannte Spiel-ID | `not-found` mit Rückweg in die Lobby |
| Aktive Selbstsperre | Spielstart blockiert, Weiterleitung auf Responsible Gaming mit Begründung |

Prüfung in Layouts, nicht in jeder einzelnen Seite.

**Zum Admin-Bereich:** In einer clientseitigen App ist jede Rollenprüfung Anzeigelogik, kein Schutz. Baue deshalb **keinen** simulierten Admin-Login — das wäre Sicherheitstheater. Der Umschalter ist offen, danebensteht der Hinweis, dass echte Autorisierung serverseitig gehört.

---

## 8. Seiten

### 8.1 Startseite
Demo-Streifen · Header mit Logo, Navigation, Demo-Guthaben · Hero mit Wertversprechen, „Demo starten", „Spiele entdecken" und Hinweis „Kein Echtgeldspiel" · Reihen: Beliebte Spiele, Neu hinzugefügt, Slots, Tischspiele, Live-Casino-Demos · Promotions · Responsible-Gaming-Hinweis · Footer.

Hero-Text: *Spiele kostenlos im Demo-Modus und entdecke die Velora Casino Experience.* Verboten: Gewinnversprechen, Verknappung, Jackpot-Behauptungen.

### 8.2 Casino-Lobby
Kategorien: Alle, Slots, Roulette, Blackjack, Baccarat, Poker, Arcade, Game Shows, Live-Demos, Neu, Beliebt, Favoriten.

Funktionen: Volltextsuche (200 ms Verzögerung, unabhängig von Groß-/Kleinschreibung und Umlauten), Filter nach Kategorie, Anbieter, Mechanik und Demo-Schwierigkeit, Sortierung nach Beliebtheit, Neuheit, Name und Empfehlung, Favoriten, „Mehr laden", Leerzustand, Filter-Reset.

**Filterkriterien liegen in der URL** (`?q=&cat=&provider=&sort=`), nicht nur im State — dadurch sind Ergebnisse teilbar, der Zurück-Button funktioniert und ein Reload verliert nichts.

Die Filterlogik ist eine reine Funktion `applyFilters(games, criteria): Game[]` in `lib/filters.ts`, ohne React-Bezug und ohne Rendering testbar.

### 8.3 Spielkarte
`GameCard` existiert **einmal**, mit drei Varianten über eine Prop (`default` | `compact` | `featured`). Startseiten-Reihen, Lobby-Raster, „Ähnliche Spiele" und Favoriten nutzen dieselbe Komponente.

Inhalt: Thumbnail, Name, Kategorie, Anbieter, Badge, Favoriten-Button (Touch-Ziel mindestens 44 × 44 px), „Demo spielen". Bei fehlendem Bild ein deterministischer Fallback, der aus dem Spielnamen eine Initialen-Kachel in der Kategoriefarbe erzeugt.

### 8.4 Spieldetailseite
Großes Bild · Name · Kategorie · Anbieter · Demo-Status · „Demo spielen" · Favorit · Kurzbeschreibung · Mechanik · Einsatzbereich · Auszahlungstabelle · Hinweis zum Demo-Guthaben · Responsible-Gaming-Link · ähnliche Spiele.

Metadaten immer gekennzeichnet: `RTP: Demo-Wert 95,0 %` · `Volatilität: Mittel` · `Minimale Demo-Runde: 0,10 Credits` · `Maximale Demo-Runde: 10,00 Credits`. Verboten: „zahlt besonders gut", „mit dieser Strategie gewinnst du sicher", „maximiere deine Gewinne".

Alle sieben `RoundStatus`-Werte brauchen eine eigene UI. Während einer laufenden Runde sind die Bedienelemente inaktiv.

### 8.5 Demo-Kennzeichnung
1. **Streifen** oben auf jeder Seite, nicht schließbar, Türkis auf dunkel: *Demo-Prototyp — kein Echtgeldspiel, keine Auszahlungen*
2. **Badge** an jeder Zahl mit Geldbezug, Einheit „Credits", im Header das Kürzel „DEMO"
3. **Kontexthinweis** vor jeder Aktion, die im Echtgeldprodukt Geld bewegen würde

### 8.6 Wallet
Start: 1.000,00 Credits, Bonus 0,00, 0 Freispiele. Aktionen: +100, +500, Zurücksetzen. Jede Änderung erzeugt eine Transaktion. Bei zu wenig Guthaben **inline am Einsatzfeld**, nicht als Modal: *Dein Demo-Guthaben reicht für diese Runde nicht aus. Setze es zurück oder füge Demo-Credits hinzu.*

### 8.7 Login und Registrierung
Login: E-Mail, Passwort, „Eingeloggt bleiben". Registrierung: Anzeigename, E-Mail, Passwort, Bestätigung, Zustimmung zu Demo-Nutzungsbedingungen. Sichtbar: *Dies ist ein Demo-Konto. Es werden keine Echtgeld- oder Identitätsdaten benötigt.* Passwortbehandlung nach Regel 5.

Validierung: Pflichtfelder, E-Mail-Format, Passwort-Mindestlänge, Übereinstimmung, verständliche Meldungen, Fokus auf das erste fehlerhafte Feld.

### 8.8 Nutzerbereich
Dashboard (Guthaben, gespielte Runden, Favoritenzahl, Nettostatistik, zuletzt gespielt, RG-Kurzstatus) · Spielhistorie (Tabelle auf Desktop, Karten auf Mobile, Filter nach Zeitraum und Spiel, Sortierung, Leerzustand) · Profil · Sicherheit (Passwortwechsel als Attrappe, 2FA deaktiviert mit Erklärung, Login-Historie und Geräte als Mock).

### 8.9 Responsible Gaming
Prominent und jederzeit erreichbar. Aktuelle Spielzeit, Session-Pause, Demo-Limit, Selbstsperre, Erinnerung nach längerer Nutzung, Hilfebereich.

**Selbstsperre und Pause blockieren tatsächlich.** Entsperren nur über einen expliziten Zwei-Schritt-Dialog in diesem Bereich, nie über einen Banner-Button.

Hinweistext: *Bitte spiele verantwortungsvoll. Dieser Prototyp verwendet kein Echtgeld. Bei einem realen Glücksspielangebot wären Altersprüfung, Limits, Selbstsperre, KYC und weitere Schutzmaßnahmen erforderlich.*

### 8.10 Promotions
Drei Beispiele, rein als UI-Muster: Demo-Willkommensbonus (200 Freirunden), Weekend Challenge, VIP-Lounge. Je Karte: Titel, Beschreibung, Demo-Belohnung, Mock-Gültigkeit, Status, Detailansicht, „Demo aktivieren". Keine Einzahlungsvoraussetzungen, keine Umsatzbedingungen, keine Aussagen zu Gewinnchancen. Bonusguthaben bleibt additiv und ohne Bedingungen.

### 8.11 Admin (M3)
Dashboard mit Demo-Kennzahlen · Spielverwaltung (anlegen, bearbeiten, Kategorie, Anbieter, Tags, Badges, aktivieren/deaktivieren, Vorschaubild) · Nutzerverwaltung (Mock) · Content (Hero, Promotions, Kategoriereihenfolge, FAQ, RG-Hinweise) · Audit-Log · Fehler-Injektor, der echte Fehlerzustände in der App auslöst.

Destruktive Aktionen brauchen Bestätigung. Änderungen landen im Audit-Log.

---

## 9. Fehler-, Leer- und Ladezustände

Alle Meldungen folgen dem Muster **Was ist passiert → Was jetzt tun**, in der Stimme der Oberfläche, ohne Entschuldigung, ohne Stacktrace.

| Zustand | Darstellung | Handlungsoption |
|---|---|---|
| Keine Treffer | `EmptyState` im Raster, Filter bleiben sichtbar | „Filter zurücksetzen" plus drei Vorschläge |
| Bild fehlt | Fallback-Kachel, Layout unverändert | — |
| Spiel deaktiviert | Karte gedimmt, Badge „Zurzeit nicht verfügbar", Start inaktiv | „Ähnliche Spiele ansehen" |
| Guthaben zu niedrig | inline am Einsatzfeld | Credits hinzufügen / zurücksetzen |
| Session abgelaufen | Modal beim nächsten Interagieren | „Erneut anmelden" mit Rückkehr |
| Nicht angemeldet | Weiterleitung mit `next` | Anmelden oder Registrieren |
| Admin ohne Rolle | eigene Seite | Rolle aktivieren |
| Ungültige Eingabe | inline, `aria-describedby`, Fokus aufs Feld | feldbezogener Hinweis |
| Mehrfachabsenden | Button inaktiv plus `roundInFlight` | — |
| Langsames Laden | Skeleton in Zielgröße, ab 3 s Zusatztext | „Abbrechen" wo sinnvoll |
| Serverfehler (simuliert) | `ErrorState` im betroffenen Bereich, Rest bedienbar | „Erneut versuchen" |
| Leere Historie / Favoriten | `EmptyState` | „Zur Lobby" / „Spiele entdecken" |
| Ungültige Spiel-ID | `not-found` | „Zur Lobby" plus Suche |
| Storage fehlt oder defekt | Toast beim Start, App läuft im Speicher | Hinweis auf fehlende Persistenz |
| Selbstsperre aktiv | Start inaktiv mit Begründung | „Zu Responsible Gaming" |

Ein `EmptyState` mit Props für Icon, Titel, Text und Aktion deckt alle Leerzustände ab. Ein `AsyncBoundary` kapselt Laden, Fehler und Wiederholung und umschließt jeden datenabhängigen Bereich.

---

## 10. Mock-Daten

**24 Spiele.** (Die ursprüngliche Aufzählung ergab 25 bei vorgegebener Obergrenze 24 — `Candy Spin` entfällt.)

**Slots (11):** Classic Fruit · Neon Nights · Kupferschacht · Codex Aurelia · Salzwind · Sandkönigin · Mystic Jungle · Luxury 7s · Staubpfad · Zunderschuppe · Lunara Drift

**Tischspiele (6):** European Roulette · American Roulette · Classic Blackjack · VIP Blackjack · Baccarat · Video Poker

**Arcade und Game Shows (4):** Plinko Demo · Mines Demo · Dice Demo · Wheel Demo

**Live-Demos (3):** Live Roulette Demo · Live Blackjack Demo · Live Baccarat Demo — reine UI-Simulation, statischer Dealer-Bereich, deutlich als Demo gekennzeichnet, keine Personenfotos.

**Anbieter (6, frei erfunden):** Velora Studios · Northgate Play · Kessel & Sonne · Halbmond Interactive · Tessera Games · Fünf Türme Studio

Zusätzlich `mock-history.ts` mit vorbefüllter Historie und Admin-Kennzahlen, gekennzeichnet als Beispieldaten — sonst sind beim ersten Start alle Tabellen leer und der Prototyp wirkt kaputt.

Bilder: abstrakte Motive in der Farbwelt des Designsystems, keine realen Marken, keine Personen.

---

## 11. Responsive

Haltepunkte 360 / 640 / 768 / 1024 / 1280 / 1536, untere Testgrenze **320 px**.

| Bereich | Mobil | Tablet | Desktop |
|---|---|---|---|
| Navigation | feste Bottom-Nav, fünf Ziele (Home, Casino, Favoriten, Wallet, Profil) | Bottom-Nav bis 767 | volle Navigation im Header |
| Spielraster | 2 Spalten | 3 | 4–6 |
| Filter | Vollbild-Drawer von unten, Übernehmen/Zurücksetzen | Drawer seitlich | feste Spalte links |
| Historie | Kartenliste | Tabelle, reduzierte Spalten | volle Tabelle |
| Wallet | eigene Seite | zweispaltig | Seitenpanel plus Historie |
| Admin | Hinweis „für größere Bildschirme optimiert", Listen lesbar | eingeschränkt | vollständig |

Bottom-Nav respektiert `env(safe-area-inset-bottom)`. Kein horizontales Scrollen bei 320 px. Karussells auf der Startseite scrollen bewusst horizontal, mit sichtbarer Kante und Tastaturbedienung. Keine wichtige Funktion existiert nur im Desktop-Menü.

---

## 12. Barrierefreiheit

Semantische Überschriftenhierarchie ohne Sprünge · sichtbarer Fokus überall · vollständige Tastaturbedienung inklusive Fokusfalle in Modal und Drawer und Rückgabe des Fokus beim Schließen · sinnvolle ARIA-Labels, keine dekorativen · Toasts mit `aria-live="polite"`, Fehler mit `role="alert"` · Alternativtexte aus den Daten · Statusinformation nie allein über Farbe (immer Icon oder Text dazu) · Touch-Ziele mindestens 44 × 44 px · `prefers-reduced-motion` respektiert · Formularfehler mit `aria-describedby` verknüpft.

---

## 13. Tests

### Automatisiert — müssen grün sein

1. Einsatz über Guthaben wird abgelehnt, Kontostand unverändert
2. Guthaben wird nie negativ, über 500 zufällige Aktionsfolgen (Property-Test)
3. `balanceAfterMinor` stimmt nach jeder Transaktionskette
4. Doppelter Rundenstart erzeugt genau eine Buchung
5. Auszahlungstabelle trifft den ausgewiesenen RTP, 100.000 Runden je Spiel, Toleranz ±0,5 Prozentpunkte
6. Filterkombinationen liefern erwartete Mengen, inklusive Leermenge
7. Suche unabhängig von Groß-/Kleinschreibung und Umlauten
8. Formatierung korrekt, inklusive 0 und Maximalwert
9. Validierung: leer, ungültige E-Mail, zu kurzes Passwort, Nichtübereinstimmung
10. Defektes und fehlendes LocalStorage führen zu sauberen Defaults
11. Aktive Selbstsperre blockiert alle einsatzbezogenen Aktionen
12. **Kein Passwort landet im persistierten State** (Regressionstest zu Regel 5)

### Manuell — als Checkliste ausgeben

Startseite auf Desktop und bei 320 px · suchen, filtern, favorisieren · Demo-Spiel starten und Guthabenverlauf nachvollziehen · Runde bei zu wenig Guthaben blockiert · Guthaben zurücksetzen · Historie prüfen · Registrierung und Logout · RG-Pause aktivieren und Spielstart als blockiert bestätigen · Admin ohne Rolle · Spiel im Admin deaktivieren und Wirkung in der Lobby prüfen · ungültige Spiel-ID · komplette Tastaturbedienung ohne Maus · `prefers-reduced-motion` · Reload auf jeder Route ohne Zustandsverlust.

---

## 14. Arbeitsweise

**Umfang nach E4 — standardmäßig nur M1.**

- **M1:** Designsystem, Layout, Startseite, Lobby mit Suche/Filter/Sortierung/Favoriten, Spieldetailseite, Wallet, **ein vollständig spielbarer Slot (Neon Nights)**, Responsible Gaming, alle Fehler- und Leerzustände. Das ist die vorzeigbare Version.
- **M2:** Registrierung, Login, Dashboard, Historie, Profil, Sicherheit, Promotions.
- **M3:** Admin-Bereich, Audit-Log, Fehler-Injektor.

Nach M1 anhalten und Freigabe abwarten.

### Reihenfolge innerhalb einer Iteration

Tokens und `components/ui/` → Typen und Mock-Daten → `lib/` mit Tests → State-Provider mit Reducer-Tests → Layout → Seiten → Fehler- und Leerzustände → Tastatur- und Reduced-Motion-Durchgang → Selbstkritik → Bericht.

Fehler- und Leerzustände werden **nicht** am Ende nachgerüstet. Jede Komponente wird mit ihren Zuständen zusammen gebaut.

### Selbstkritik nach jeder Iteration

Beantworte schriftlich: Was kann hier kaputtgehen? Was macht ein Nutzer falsch? Was passiert bei ungültigen Daten? Welche Annahme könnte falsch sein? Was wurde nicht getestet? Welche technische Schuld entsteht? Was würde ein unabhängiger Senior Engineer kritisieren?

Arbeite die relevanten Punkte ab, bevor du weitergehst.

### Ehrlichkeit

- Behaupte nie, einen Test ausgeführt zu haben, den du nicht ausgeführt hast.
- Erfinde keine Performance-, Kontrast- oder Accessibility-Werte.
- Was du nicht prüfen konntest, kennzeichnest du als **„Nicht verifiziert"** und begründest es.
- „Sieht gut aus" und „funktioniert" sind ohne nachvollziehbare Prüfung keine Aussagen.

Ohne Browserzugriff sind visuelles Erscheinungsbild, Ladezeiten, Screenreader-Verhalten und Cross-Browser-Kompatibilität grundsätzlich nicht verifiziert.

---

## 15. Abschlussbericht

Nach jeder Iteration ein kurzer Bericht:

- **Funktionalität** — was läuft, wie geprüft
- **Tests** — welche ausgeführt, welche Ergebnisse, welche fehlgeschlagen
- **Nicht verifiziert** — was und warum
- **Bekannte Probleme** — nach Critical / High / Medium / Low
- **Technische Schuld** — was bewusst offengelassen wurde
- **Empfehlung** — nicht bereit / bedingt bereit / bereit, mit Begründung

Critical- und High-Punkte müssen behoben oder ausdrücklich begründet sein.

---

## 16. Was ausdrücklich nicht gebaut wird

Echtgeld, Zahlungsanbindung, KYC, Altersverifikation, Lizenzdarstellung, serverseitige Authentifizierung, echte Spiel-Engines, Multiplayer, Live-Video, Tracking, Analytics, Consent-Banner.

Falls später eine Echtgeldversion geplant ist: Lizenz je Zielmarkt, Identitäts- und Altersprüfung, Geldwäscheprävention, zertifizierte Zufallsgenerierung durch ein akkreditiertes Testlabor, serverautoritative Spiellogik, auditierbares Transaktionsjournal, PCI-DSS-Rahmen, DSGVO-Konzept, Sozialkonzept und Spielerschutzprozesse, externe Penetrationstests. **Nichts davon gehört in diesen Prototypen.**
