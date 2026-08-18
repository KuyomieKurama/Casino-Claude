# Casino Claude — Projekt-Anweisungen

**velora-casino-demo** v0.1.0 — interaktive Casino-Lobby mit Authentifizierung, Datenbankpersistierung und Demo-Spielmechanik. 24 Spieltitel über sieben Engine-Familien, davon 23 aktiv spielbar; ein Titel (Staubpfad) ist absichtlich deaktiviert, um den Zustand "Zurzeit nicht verfügbar" zu zeigen. Echtgeld-Transaktionen nicht implementiert.

> **Warnung**: `.claude/memory/`, `.claude/skills/` und `.claude/agents/` beschreiben das fremde Projekt "Yozora" (Homelab-Dashboard). Sie sind für dieses Repository ungültig. Gültig sind nur `.claude/rules/ecc/common/*` und `.claude/rules/ecc/typescript/*`, die projektneutrale ECC-Standards definieren.

## Befehle

Paketmanager: **npm** (lockfileVersion 3, keine pnpm).

```bash
docker compose up -d              # PostgreSQL starten (lokal)
npm run db:generate               # Drizzle-Schema → drizzle/
npm run db:migrate                # Migrationen gegen DB anwenden
npm run db:seed                   # Test-Daten einfügen (ADMIN_BOOTSTRAP_EMAIL setzen, siehe .env.example)
npm run dev                        # Next.js (Port 3000)
npm run build                      # Next.js build mit Node.js-Server (next build + next start)
npm start                          # Produktionsserver nach build
npm run lint                       # ESLint
npm run typecheck                  # tsc --noEmit
npm test                           # Vitest (run)
npm run test:watch                 # Vitest (watch)
node scripts/generate-thumbs.mjs   # Erzeugt public/thumbs/*.svg
```

Statischer Export (`NEXT_OUTPUT=export`) ist nicht mehr möglich — siehe `next.config.ts` für Begründung.

## Stack & Pfade

**Next.js 15.5.23** (App Router, kein Pages Router), **React 19.2.8**, **TypeScript 5.9.3** (`strict: true`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`), **Tailwind CSS 4.3.3**, **Vitest 3.2.7** + Testing Library + jsdom, **lucide-react 0.577.0**, **ESLint 9.39.5** Flat Config.

Backend & Persistence: **PostgreSQL**, **Drizzle ORM 0.37** (`drizzle-kit` für Migrationen), **pg 8.12** (Node.js-Driver), **better-auth 1.4** (Authentifizierung, OAuth, Sitzungsverwaltung), **zod 3.24** (Eingabevalidierung).

Pfad-Alias: `@/*` → Root (nicht `src/`; das Projekt hat kein `src/`).

## Verzeichnisstruktur

```
app/                    # App Router; Routengruppe (user) für eingeloggte Bereiche
  api/auth/[...all]/    # better-auth Route Handler
  (user)/               # Protected, serverseitig geprüft (middleware.ts + server/auth/guards.ts)
  admin/                # Admin-Seite, requireAdmin() geprüft
  login/                # Öffentlich
  register/             # Öffentlich
middleware.ts           # Cookie-Präsenz prüfen, Umleitung nach /login?next=… (KEINE Autorisierung!)
components/
  ui/                   # Zustandslose Primitive (kein Context, keine Fachlogik)
  layout/               # Header, Footer, BottomNavigation, DemoBanner
  auth/                 # OAuthButtons, Login/Register-Komponenten
  game/                 # GameCard, GameGrid, Filter, Suche, Favoriten, Lobby
    engine/
      {arcade,baccarat,blackjack,roulette,videopoker}/  # Engine-Familien
      slot/             # Universelle Slot-Engine (11 Titel)
      useRound.ts       # Hook: Laden, Einsatz, Sperren, Buchung, Status-Management
      GameShell.tsx     # Rahmen-UI (h2, Status-Zeile, Buttons)
      registry.tsx      # Lazy-Loading-Registry (next/dynamic, ssr: false)
  {wallet,rg,user,promotions,feedback,home}/  # Weitere Module
data/
  games.ts              # Mock-Spiele (keine RTP-Hand-Pflege!)
  catalog.ts            # withDerivedRtp(), rtpOf() – RTP aus Paytable berechnet
  categories.ts, providers.ts, promotions.ts, mock-history.ts
  paytables/
    {arcade,baccarat,roulette,slots,videopoker}.ts  # Per gameId oder gameId::betId
    index.ts                                        # Kein blackjack.ts (strategieabhängig, keine RTP)
drizzle/                # Drizzle-Migrationen und auto-generated Typen
lib/                    # Reine Funktionen (kein React, kein State, kein Storage außer storage.ts)
  env.ts                # Umgebungsvariablen, zentrale Validierung (server-only)
  constants.ts          # STORAGE_KEY = "velora.demo.v1"
  storage.ts            # LocalStorage-Wrapper (250 ms-Drosselung, JSON-Fallback)
  formatters.ts         # formatCredits*() – nur diese für Geld-Display
  rng.ts                # mulberry32; keine Math.random() in Engines
  paytable.ts           # buildPaytable(), uniformPaytable()
  {cn,validation,filters,ids}.ts  # Utilities
  safe-redirect.ts      # Sichere Redirect-URL-Prüfung
  auth-errors.ts        # Fehlerbehandlung für better-auth
server/
  db/                   # PostgreSQL-Verbindung (Drizzle-Client), Schema, Test-Harness
  repositories/         # Data-Access-Layer (User, Session, etc.)
  auth/                 # better-auth-Konfiguration, Guards, OAuth-Provider, Rate-Limiting
  seed/                 # Seeding-Skripts
state/                  # Context + Reducer (AppProviders, CatalogContext, SessionContext)
types/
  money.ts              # CreditsMinor = Hundertstel (nie float)
  engine.ts, game.ts, game-round.ts, user.ts, wallet.ts, …
test/
  setup.ts              # jsdom, globals: true
  catalog.test.ts       # Projektweite Konsistenztests
public/thumbs/          # SVG-Thumbs (von generate-thumbs.mjs)
```

## Schichtregeln (ESLint-erzwungen)

- `lib/**` importiert nichts aus `components`, `app`, `state`; `process.env` nur in `lib/env.ts`
- `lib/env.ts` ist die einzige Datei außer `next.config.ts` und `drizzle.config.ts`, die `process.env` liest
- `data/**` importiert nur `types/` + gezielt `lib/paytable`, `lib/rng`
- `components/ui/**` importiert nichts aus `state`, `data`
- `server/**` importiert nichts aus `components`, `state`; nur `lib/env.ts` ist erlaubt
- `components/` und `state/` importieren nichts aus `server/`
- Storage nur in `lib/storage.ts` (keine globalen `localStorage`-Zugriffe außer dort)

## Harte Invarianten

**Geld**: `CreditsMinor` = ganzzahlige Hundertstel. Nie float. Nur `formatCredits*()` für Display.

**RNG**: Nur `mulberry32(seed)` in Engines; `Math.random()` nur für Startseed. Gleicher Seed = gleiche Ergebnisse.

**RTP**: Automatisch aus Paytable berechnet in `catalog.ts` via `withDerivedRtp()`, nicht von Hand gepflegt.

**Persistenz**: LocalStorage-Schlüssel `velora.demo.v1`, 250 ms-Drosselung, In-Memory-Fallback bei JSON-Fehler.

**Hydration**: `hydrated`-Flag; Skeletons vor Laden, nie springende Platzhalterwerte.

**Passwörter**: Von better-auth verwaltet, gehasht, nie im Code sichtbar.

**Admin-Rolle**: Ausschließlich über `ADMIN_BOOTSTRAP_EMAIL` in der Umgebungskonfiguration vergeben (beim Seed). Server-seitige Prüfung via `requireAdmin()` in `server/auth/guards.ts`. Keine Web-UI für Rollenvergabe.

**Authentifizierung**: better-auth mit PostgreSQL. Session-Cookies, Sitzungs-TTL 1 Stunde (oder 30 Tage mit "angemeldet bleiben"). OAuth optional (Google, GitHub, Discord), Passwort-basiert immer verfügbar.

**Ergebnis-Display**: Immer Netto (`returnMinor − stakeMinor`).

## Verbotene Dark Patterns

Autoplay, Turbospin, betonter Near Miss, Loss Disguised as Win, vorausgewählte Bonusoptionen, Ton, Druck-Countdowns, künstliche Verknappung, Gewinnversprechen, Strategieempfehlungen, Tracking, Analytics, reale Marken, Personenfotos.

## Authentifizierung und Autorisierung

**Technologie**: better-auth 1.4 mit PostgreSQL. Session-Cookies, optional OAuth (Google, GitHub, Discord).

**Authentifizierung (Identität prüfen)**:
- `middleware.ts` (Edge Runtime): Prüft AUSSCHLIESSLICH Cookie-Präsenz; leitet nicht-angemeldete Nutzer nach `/login?next=…` um.
  - **Warnung**: Keine Autorisierungslogik hier! Ein vorhandener Cookie könnte abgelaufen oder widerrufen sein. Die echte Prüfung erfolgt im Server.
- `server/auth/guards.ts`: `requireUser()` und `requireAdmin()` mit Datenbankzugriff; wird in Server Components und Route Handlern verwendet.
  - Prüft Sitzung gegen die Datenbank, nicht nur den Cookie.
  - Bei ungültiger Sitzung Umleitung nach `/login?next=…`.

**Autorisierung (Rollen prüfen)**:
- **Normal-Nutzer**: Jeder angemeldete Nutzer (`requireUser()`).
- **Admin**: Nur über `ADMIN_BOOTSTRAP_EMAIL` in der Umgebung (gesetzt beim Seed). Server-seitige Prüfung via `requireAdmin()`.
  - Keine Web-UI für Rollenvergabe.
  - Admin-Rechte sind persistent in der Datenbank (`users.role`).

**OAuth-Konfiguration**: Alle Provider optional. Wird nur aktiviert, wenn both ID und Secret in `.env` gesetzt sind (`server/auth/providers.ts` prüft das). Callback-URLs: `{BETTER_AUTH_URL}/api/auth/callback/{google,github,discord}`.

**Rate-Limiting**:
- Login-Versuche: 5 Fehler pro E-Mail in 15 Minuten.
- IP-basiert (optional, erfordert `TRUSTED_PROXY_IPS`): Verhindert Brute-Force über verschiedene Konten.
- Siehe `server/auth/rate-limit.ts` und `server/auth/rate-limit-plugin.ts`.

## Engine-Architektur

Alles über `useRound()` in `components/game/engine/useRound.ts`:
- Status: `idle|loading|ready|playing|paused|finished|error`
- Ablauf: Laden → Sperren → Einsatz → Doppelklick-Schutz → Inline-Fehler → `settle()`
- Interaktive Spiele: `useRound({ interactive: true })` mit `maxReturnMinor`-Cap vom Wallet-Reducer

Engine-Signatur (`types/engine.ts`):
```typescript
export function XyzGame({ game, simulateLoadError, onStatusChange }: GameEngineViewProps)
```

**Neue Engine erstellen**:
1. Logik: `components/game/engine/<familie>/<name>-logic.ts` (kein React)
2. Paytable: `data/paytables/<familie>.ts` (Schlüssel: `gameId` oder `gameId::betId`)
3. View: `components/game/engine/<familie>/<Name>Game.tsx` (`"use client"`, `useRound` + `GameShell`)
4. Registry: Eintrag in `components/game/engine/registry.tsx`
5. Tests: `<name>-logic.test.ts` — Tabelle summiert 1, RTP-Treffer ±0,5pp, Determinismus, keine negativen Beträge, Fachregeln

**Gesperrte Dateien** (nur mit ausdrücklichem Auftrag ändern):
- `registry.tsx` (außer Registrierungseintrag)
- `data/paytables/index.ts`
- `data/games.ts`, `data/catalog.ts`
- `useRound.ts`, `GameShell.tsx`
- `state/**`, `lib/**`

Siehe `ENGINE-BRIEF.md` für Rahmen und Regeln; bei Konflikten gelten `velora-implementierungs-prompt.md` und `velora-konzept.md` vor `ENGINE-BRIEF.md`.

## Barrierefreiheit & Design

**A11y**: Überschriftenhierarchie ohne Sprünge (Shell: h2, Engine: h3+). Jedes Element mit Name. Touch ≥ 44×44 px. Status nicht nur Farbe. `aria-live="polite"` von Shell. Kein Horizontal-Scroll bei 320 px. `prefers-reduced-motion` respektieren.

**Design-Tokens** (CSS-Custom-Properties in `app/globals.css`, nur diese; keine Hex-Werte im Code): `--bg-surface`, `--text-primary`, `--text-muted`, `--border-subtle`, `--border-control`, `--text-teal`, `--text-gold`, `--text-success`, `--text-warning`, `--text-danger`. Gold ist knapp (max. eine Fläche/Screen, belegt vom Start-Button); Engine-Elemente Umriss oder Text.

**Kontrast-Tests**: `app/design-tokens.test.ts` prüft Farbkontraste gegen WCAG AA (4.5:1 für Text, 3:1 für UI-Komponenten) im gerenderten DOM — nicht theoretisch, sondern im echten Browser-Kontext.

## Tests

Vitest + jsdom, Setup `test/setup.ts`, Alias `@` → Root.

Tests koloziert als `*.test.ts`/`*.test.tsx`; projektweite Tests in `test/catalog.test.ts`.

Konfiguration: `globals: true`, `testTimeout: 120_000` (Millionen-Runden-RTP-Simulationen). Keine CI, kein E2E-Framework installiert.

## Sprache & Ton

UI-Texte und Code-Kommentare: **Deutsch**, sachlich, keine Werbesprache, keine Ausrufezeichen.

Fehlermeldungen: "Was passiert → Was tun", ohne Entschuldigung, ohne Stacktrace.

Kommentare: Erklären das Warum.

## Bewusst nicht vorhanden

**Feature-Level**: Autoplay, Turbospin, betonter Near Miss, Loss Disguised as Win, vorausgewählte Bonusoptionen, Ton, Druck-Countdowns, künstliche Verknappung, Gewinnversprechen, Strategieempfehlungen, Tracking, Analytics, E-Mail-Versand (deshalb kein Passwort-Reset über UI), Auszahlungs- oder Einzahlungsfunktionalität, KYC.

**Infrastruktur**: Kein `src/`-Verzeichnis, keine CI-Workflows, keine `.github/`-Actions, kein E2E-Framework (Playwright/Cypress), kein `docs/`-Verzeichnis, keine `config/`.

**Admin-Bereich**: Nur ein Gate; Spielverwaltung, Nutzerverwaltung, Content, Audit-Log und Fehler-Injektor sind nicht implementiert (Iteration M3).

## Weitere Ressourcen

- `README.md` — Schnellstart mit Datenbank, Umgebungsvariablen, OAuth-Einrichtung, Entscheidungstabelle, Kurzanleitung "Neue Spiel-Engine hinzufügen"
- `ENGINE-BRIEF.md` — Engine-Spezifikation, verbindlicher Rahmen für Engine-Implementierungen (harte Regeln, Architektur, Tests, Dateigrenzen)
- `PRUEFLISTE.md` — Manuelle QA-/Durchgangs-Checkliste
- `BERICHT.md` — Abschlussbericht mit Stand und Begründungen (beschreibt den Zustand vor dem Fullstack-Umbau)
- `velora-konzept.md`, `velora-implementierungs-prompt.md` — Ursprungsspezifikationen
- `.claude/rules/ecc/common` — Projekt-unabhängige Standards (Git, Testing, Security, Code-Review, Coding-Style, Development-Workflow)
- `.claude/rules/ecc/typescript` — TypeScript-spezifische ECC-Standards
- `.env.example` — Vorlage für Umgebungsvariablen mit ausführlichen Kommentaren
