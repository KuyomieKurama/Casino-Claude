# Velora Casino Demo

Interaktive Casino-Lobby mit Authentifizierung, Datenbankpersistierung und Demo-Spielmechanik. 24 Spieltitel über sieben Engine-Familien. Zweck ist die Demonstration von Oberfläche, Bedienung, Informationsarchitektur und funktionsfähiger Spiellogik.

**Echtgeld nicht implementiert. Keine Einzahlung. Keine Auszahlung. Keine Lizenz.**

## Schnellstart

Voraussetzungen: Node 22, Docker (für PostgreSQL lokal).

```bash
# 1. Dependencies installieren
npm install

# 2. PostgreSQL starten (lokal mit docker-compose)
docker compose up -d

# 3. Umgebungsvariablen konfigurieren
cp .env.example .env.local
# → DATABASE_URL und BETTER_AUTH_SECRET sind Pflicht
# → Weitere Optionen: ADMIN_BOOTSTRAP_EMAIL, OAUTH_*_CLIENT_ID/SECRET, TRUSTED_PROXY_IPS

# 4. Datenbank initialisieren
npm run db:migrate
npm run db:seed    # Optional: Test-Daten, ADMIN_BOOTSTRAP_EMAIL wird Admin

# 5. Entwicklung starten
npm run dev        # http://localhost:3000
```

Weitere Befehle:

```bash
npm run build      # Produktionsbuild (Node.js-Server erforderlich)
npm start          # Produktionsserver (nach build)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint inkl. Schichtregeln
npm test           # Vitest
npm run db:generate   # Drizzle-Schema regenerieren (nach Schema-Änderung)
npm run db:migrate    # Migrationen gegen DB anwenden
npm run db:seed       # Test-Daten einfügen
node scripts/generate-thumbs.mjs   # Vorschaubilder neu erzeugen
```

## Wo was liegt

```
app/               Routen und Layouts (App Router); (user)-Gruppe für eingeloggte Bereiche
  api/auth/        better-auth Route Handler
middleware.ts      Cookie-Präsenz prüfen, Umleitung nach /login
components/
  ui/              zustandslose Primitive (Button, Input, Modal, Toast …) — kennen keine Fachlogik
  layout/          Header, Bottom-Nav, Footer, Demo-Streifen, systemweite Hinweise
  auth/            Login/Register/OAuth-Komponenten
  game/            Spielkarte, Raster, Lobby, Detailseite
  game/engine/     Spiel-Engines: gemeinsame Choreografie (useRound), Rahmen-UI (GameShell), Registry
  wallet/          Demo-Wallet, Guthabenanzeige, Transaktionsliste
  rg/              Session-Timer, Responsible-Gaming-Panel, Zwei-Schritt-Dialoge
  feedback/        EmptyState, ErrorState, AsyncBoundary
data/              typisierte Mock-Daten; paytables/ enthält die dokumentierten Auszahlungstabellen
drizzle/           Drizzle-Migrationen und auto-generated Typen
lib/               reine Funktionen: filters, formatters, validation, rng, paytable, storage, env
server/            PostgreSQL-Zugriff, Authentifizierung, Autorisierung, Seeding
  db/              Datenbankverbindung, Schema
  repositories/    Data-Access-Layer
  auth/            better-auth-Konfiguration, Guards, OAuth, Rate-Limiting
  seed/            Seeding-Skripts
state/             Provider und Reducer je Domäne
types/             gemeinsame Typen
```

**Schichtregeln** (per ESLint durchgesetzt):
- `lib/` importiert nichts aus `components/`, `app/`, `state/`; `process.env` nur in `lib/env.ts`
- `data/` importiert nur aus `types/`
- `components/ui/` kennt keinen Context
- `server/` importiert nichts aus `components/`, `state/`
- `components/`, `state/` importieren nichts aus `server/`
- LocalStorage ausschließlich in `lib/storage.ts`

## Konfiguration

Alle Umgebungsvariablen sind in `.env.example` dokumentiert. Lokale Overrides gehören in `.env.local` (wird nicht eingecheckt).

### Pflicht

- **DATABASE_URL** — PostgreSQL-Verbindung, z. B. `postgresql://velora:velora@localhost:5432/velora`
- **BETTER_AUTH_SECRET** — Mindestens 32 zufällige Zeichen, z. B. `openssl rand -base64 32`
- **BETTER_AUTH_URL** — Öffentlich erreichbare Basis-URL; lokal `http://localhost:3000`, Produktion `https://velora.example.com`
  - In Produktion (`NODE_ENV=production`) muss es `https://` sein (better-auth leitet davon ab, ob Session-Cookies das `Secure`-Attribut bekommen)

### Optional, aber einflussreich

- **ADMIN_BOOTSTRAP_EMAIL** — E-Mail-Adresse, die beim Seed automatisch Admin-Rechte erhält (muss gültig sein, wenn gesetzt)
- **OAUTH_GOOGLE_CLIENT_ID / OAUTH_GOOGLE_CLIENT_SECRET** — Google OAuth (beide oder keine)
- **OAUTH_GITHUB_CLIENT_ID / OAUTH_GITHUB_CLIENT_SECRET** — GitHub OAuth (beide oder keine)
- **OAUTH_DISCORD_CLIENT_ID / OAUTH_DISCORD_CLIENT_SECRET** — Discord OAuth (beide oder keine)
- **TRUSTED_PROXY_IPS** — Kommagetrennte Liste vertrauenswürdiger Reverse-Proxy-IPs/CIDR (z. B. `10.0.0.0/8`)
  - **Wichtig**: Nur setzen, wenn es einen tatsächlichen vorgeschalteten Proxy gibt; Leer lassen ist sicherer als falsch setzen
  - Steuert nur das IP-basierte Login-Rate-Limit (nicht die Zugriffskontrolle)
  - Grund: Ein falsch gesetzter Wert erlaubt Angreifern, ihre eigene Client-IP im `X-Forwarded-For`-Header vorzugeben und das IP-Limit zu umgehen

### OAuth-Einrichtung

Die Callback-URL ist immer `{BETTER_AUTH_URL}/api/auth/callback/{provider}`. Beispiele:
- Lokal: `http://localhost:3000/api/auth/callback/google`
- Produktion: `https://velora.example.com/api/auth/callback/google`

Diese URL muss beim OAuth-Provider (Google, GitHub, Discord) als "Authorized Redirect URI" eintragen sein. Detaillierte Schritte sind außerhalb dieses Dokuments, finden sich aber im Provider-Dashboard unter OAuth/Consent Screen.

Ohne OAuth sind Passwort-basierte Registrierung und Anmeldung immer verfügbar.

## Entscheidungen, die man kennen sollte

| Thema | Umsetzung | Warum |
|---|---|---|
| Geld | `CreditsMinor` = ganzzahlige Hundertstel, Formatierung nur über `formatCredits*` | Fließkommafehler machen die Prüfung „Guthaben ausreichend?” unzuverlässig |
| Zufall | gesäter PRNG (mulberry32), `Math.random()` nur für den Startseed | Runden sind über ihren Seed reproduzierbar und damit testbar |
| RTP | wird in `data/catalog.ts` aus der Auszahlungstabelle **berechnet**, nie von Hand gepflegt | Ausgewiesener Wert kann gar nicht von der Simulation abweichen |
| Spiele ohne Tabelle | zeigen bewusst **keinen** RTP | Behauptet wird nur, was geprüft werden kann |
| Passwörter | verwaltet und gehasht von better-auth in PostgreSQL | Server-seitige Persistierung, keine Sichtbarkeit im Code; sichere Hashing-Algorithmen (Bcrypt) |
| Admin-Rolle | ausschließlich über `ADMIN_BOOTSTRAP_EMAIL` (Umgebung beim Seed) | Persistiert in DB, serverseitig geprüft; keine Web-UI für Rollenvergabe (verhindert Privilege Escalation) |
| Authentifizierung | OAuth + Passwort-basiert, better-auth mit PostgreSQL, Session-Cookies | Single Source of Truth in der Datenbank, nicht im Client |
| Ergebnisanzeige | netto (`−0,60 Credits`), nie brutto | Eine Rückgabe unter Einsatz ist ein Verlust und wird nicht als Gewinn dargestellt |
| Hydration | `hydrated`-Flag; vorher Skeletons in Zielgröße | Nie einen Platzhalterwert wie 1.000,00 zeigen, der dann springt |
| Persistenz (Client) | ein Schlüssel `velora.demo.v1` mit `schemaVersion`, gedrosseltes Schreiben | Defektes JSON und fremde Versionen werden verworfen statt geraten |
| Persistenz (DB) | Drizzle ORM, Migrationen versioniert, Seed-Skript für Testdaten | Konsistente Schema-Versionierung, einfache Wiederherstellung vom Seed |

## Bewusst nicht vorhanden

**Dark Patterns**: Autoplay, Turbospin, betonte Beinahe-Treffer (Near Miss), Gewinnfanfaren bei Rückgaben unter Einsatz (Loss Disguised as Win), vorausgewählte Bonusoptionen, Ton, Countdown-Timer mit Druckwirkung, künstliche Verknappung, Gewinnversprechen, Strategieempfehlungen, Tracking, Analytics.

**Geschäftslogik**: Echtgeld-Transaktionen, Zahlungsanbindung, KYC, Altersverifikation, E-Mail-Versand (daher kein Passwort-Reset über UI), Lizenzdarstellung, echte Spiel-Engines, Multiplayer, Live-Video.

**Admin-Bereich**: Spielverwaltung, Nutzerverwaltung, Content-Management, Audit-Log, Fehler-Injektor (Iteration M3, nicht implementiert).

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
