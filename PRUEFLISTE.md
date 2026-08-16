# Manuelle Prüfliste

Die automatisierten Prüfungen (Unit-Tests, Typen, Lint, Browser-Durchlauf, Kontrast- und
Barrierefreiheits-Audit) decken das Meiste ab. Was hier steht, braucht Augen, Ohren oder echte
Geräte — und ist deshalb **nicht verifiziert**, solange es nicht abgehakt ist.

## Vor dem Durchgang

```bash
npm run build && npm start   # http://localhost:3000
```

## Darstellung und Layout

- [ ] Startseite auf Desktop (1280 px und breiter): wirkt der Bildschirm ruhig, ist genau **eine**
      goldene Fläche sichtbar?
- [ ] Startseite bei **320 px** Breite: kein horizontales Scrollen, Bottom-Nav vollständig lesbar
- [ ] Lobby bei 360 / 768 / 1024 / 1536 px: 2 / 3 / 4 / 5 Spalten, Karten gleich hoch
- [ ] Karussells auf der Startseite: sichtbare Kante als Hinweis, Pfeiltasten und Tab funktionieren
- [ ] Spieldetailseite: großes Bild scharf, Fakten lesbar, Auszahlungstabelle horizontal scrollbar
      ohne die Seite mitzuziehen
- [ ] Fallback-Kachel bei **Video Poker** (kein Bild hinterlegt): Initialen sichtbar, Layout unverändert
- [ ] Auf echtem iOS-Gerät: Bottom-Nav respektiert die Safe Area, `backdrop-blur` auf Header
      flimmert nicht beim Scrollen

## Bedienung

- [ ] Suchen, filtern, sortieren, favorisieren — Ergebnis in der URL, Zurück-Button stellt her
- [ ] Demo-Spiel starten, Guthabenverlauf in der Historie nachvollziehen (Einsatz und Ergebnis
      teilen dieselbe Runden-ID)
- [ ] Runde bei zu wenig Guthaben: Meldung **inline am Einsatzfeld**, kein Modal
- [ ] Guthaben zurücksetzen, Bestätigungsdialog erscheint, Historie bleibt erhalten
- [ ] Registrierung mit absichtlich fehlerhaften Eingaben: Fokus springt auf das erste falsche Feld
- [ ] Abmelden, danach `/history` aufrufen → Weiterleitung mit `next`, nach dem Anmelden zurück
- [ ] Responsible Gaming: Pause aktivieren → Spielstart auf **jeder** Spielseite blockiert
- [ ] Selbstsperre aktivieren, Seite neu laden → Sperre besteht weiter
- [ ] Selbstsperre aufheben: nur über den Zwei-Schritt-Dialog, nirgends sonst
- [ ] Ungültige Spiel-ID aufrufen → `not-found` mit Weg zurück und Suchfeld
- [ ] `/admin` ohne Rolle → Hinweisseite, Umschalter, **kein** Passwortfeld

## Tastatur und Screenreader

- [ ] Kompletter Durchgang ohne Maus: Skip-Link, Header, Lobby, Filter-Drawer, Spiel, Wallet
- [ ] Modal und Drawer: Fokus bleibt gefangen, Esc schließt, Fokus kehrt zum auslösenden Element zurück
- [ ] Fokusring überall sichtbar, auch auf der goldenen Fläche (dort hell statt gold)
- [ ] **Screenreader-Durchgang mit NVDA oder VoiceOver** — bislang nicht geprüft:
      - Werden Guthabenänderungen angesagt (`aria-live`)?
      - Sind Rundenergebnisse verständlich, ohne die Grafik zu sehen?
      - Sind Karten- und Symbolwerte als Text verfügbar?
      - Sind Toasts hörbar, ohne zu unterbrechen?

## Systemeinstellungen

- [ ] `prefers-reduced-motion: reduce` aktivieren: Ein- und Ausblendungen bleiben, nichts bewegt sich
- [ ] Browser mit blockiertem LocalStorage (privates Fenster, Cookies aus): Hinweis erscheint,
      App bleibt bedienbar, Verlust der Daten wird angekündigt
- [ ] Seite auf **jeder** Route neu laden: kein Zustandsverlust, kein Springen von Platzhalterwerten
- [ ] Zoom 200 %: nichts überlappt, nichts wird abgeschnitten

## Cross-Browser

- [ ] Chrome, Firefox, Safari, Edge in aktueller Version
- [ ] Safari besonders: `backdrop-filter`, `dvh`-Höhen, `env(safe-area-inset-*)`, `<dialog>`

## Inhaltliche Kontrolle

- [ ] Kein Spieltitel und kein Anbietername erinnert an ein reales Produkt
- [ ] Nirgends ein Gewinnversprechen, eine Quote ohne Tabelle oder eine Strategieempfehlung
- [ ] Demo-Kennzeichnung auf jeder Seite sichtbar (Streifen, Badge an jeder Zahl, Kontexthinweis)
- [ ] Kein Bild zeigt eine Person, auch nicht im Live-Bereich

## Vor einem öffentlichen Deployment

- [ ] `noindex` ist gesetzt (steht in `app/layout.tsx`) und wirkt auch über die Auslieferung
- [ ] `robots.txt` ergänzen, falls die Umgebung eine eigene ausliefert
- [ ] Zugangsschutz erwägen, damit der Prototyp nicht für ein echtes Angebot gehalten wird
