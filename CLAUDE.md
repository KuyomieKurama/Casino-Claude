# Casino Claude — Projekt-Anweisungen

**velora-casino-demo** v0.1.0 — interaktiver Frontend-Prototyp einer Casino-Lobby ohne Backend, Datenbank oder Echtgeld-Transaktionen. 24 Spieltitel über sieben Engine-Familien, davon 23 aktiv spielbar; ein Titel (Staubpfad) ist absichtlich deaktiviert, um den Zustand "Zurzeit nicht verfügbar" zu zeigen.

> **Warnung**: `.claude/memory/`, `.claude/skills/` und `.claude/agents/` beschreiben das fremde Projekt "Yozora" (Homelab-Dashboard). Sie sind für dieses Repository ungültig. Gültig sind nur `.claude/rules/ecc/common/*` und `.claude/rules/ecc/typescript/*`, die projektneutrale ECC-Standards definieren.

## Befehle

Paketmanager: **npm** (lockfileVersion 3, keine pnpm).

```bash
npm run dev              # Next.js (Port 3000)
npm run build            # Next.js build (next build)
NEXT_OUTPUT=export npm run build  # Statischer Export → out/
npm start                # Produktion (after build)
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm test                 # Vitest (run)
npm run test:watch       # Vitest (watch)
node scripts/generate-thumbs.mjs  # Erzeugt public/thumbs/*.svg
```

## Stack & Pfade

**Next.js 15.5.23** (App Router, kein Pages Router), **React 19.2.8**, **TypeScript 5.9.3** (`strict: true`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`), **Tailwind CSS 4.3.3**, **Vitest 3.2.7** + Testing Library + jsdom, **lucide-react 0.577.0**, **ESLint 9.39.5** Flat Config.

Pfad-Alias: `@/*` → Root (nicht `src/`; das Projekt hat kein `src/`).

## Verzeichnisstruktur

```
app/                    # App Router; Routengruppe (user) für eingeloggte Bereiche
components/
  ui/                   # Zustandslose Primitive (kein Context, keine Fachlogik)
  layout/               # Header, Footer, BottomNavigation, DemoBanner, RequireUser
  game/                 # GameCard, GameGrid, Filter, Suche, Favoriten, Lobby
    engine/
      {arcade,baccarat,blackjack,roulette,videopoker}/  # Engine-Familien
      slot/             # Universelle Slot-Engine (11 Titel)
      useRound.ts       # Hook: Laden, Einsatz, Sperren, Buchung, Status-Management
      GameShell.tsx     # Rahmen-UI (h2, Status-Zeile, Buttons)
      registry.tsx      # Lazy-Loading-Registry (next/dynamic, ssr: false)
  {auth,wallet,rg,admin,user,promotions,feedback,home}/  # Weitere Module
data/
  games.ts              # Mock-Spiele (keine RTP-Hand-Pflege!)
  catalog.ts            # withDerivedRtp(), rtpOf() – RTP aus Paytable berechnet
  categories.ts, providers.ts, promotions.ts, mock-history.ts
  paytables/
    {arcade,baccarat,roulette,slots,videopoker}.ts  # Per gameId oder gameId::betId
    index.ts                                        # Kein blackjack.ts (strategieabhängig, keine RTP)
lib/                    # Reine Funktionen (kein React, kein State, kein Storage außer storage.ts)
  constants.ts          # STORAGE_KEY = "velora.demo.v1"
  storage.ts            # LocalStorage-Wrapper (250 ms-Drosselung, JSON-Fallback)
  formatters.ts         # formatCredits*() – nur diese für Geld-Display
  rng.ts                # mulberry32; keine Math.random() in Engines
  paytable.ts           # buildPaytable(), uniformPaytable()
  {cn,validation,filters,ids}.ts  # Utilities
state/                  # Context + Reducer (AppProviders, CatalogContext, etc.)
types/
  money.ts              # CreditsMinor = Hundertstel (nie float)
  engine.ts, game.ts, game-round.ts, user.ts, wallet.ts, …
test/
  setup.ts              # jsdom, globals: true
  catalog.test.ts       # Projektweite Konsistenztests
public/thumbs/          # SVG-Thumbs (von generate-thumbs.mjs)
```

## Schichtregeln (ESLint-erzwungen)

- `lib/**` importiert nichts aus `components`, `app`, `state`
- `data/**` importiert nur `types/` + gezielt `lib/paytable`, `lib/rng`
- `components/ui/**` importiert nichts aus `state`, `data`
- Storage nur in `lib/storage.ts` (keine globalen `localStorage`-Zugriffe außer dort)

## Harte Invarianten

**Geld**: `CreditsMinor` = ganzzahlige Hundertstel. Nie float. Nur `formatCredits*()` für Display.

**RNG**: Nur `mulberry32(seed)` in Engines; `Math.random()` nur für Startseed. Gleicher Seed = gleiche Ergebnisse.

**RTP**: Automatisch aus Paytable berechnet in `catalog.ts` via `withDerivedRtp()`, nicht von Hand gepflegt.

**Persistenz**: LocalStorage-Schlüssel `velora.demo.v1`, 250 ms-Drosselung, In-Memory-Fallback bei JSON-Fehler.

**Hydration**: `hydrated`-Flag; Skeletons vor Laden, nie springende Platzhalterwerte.

**Passwörter**: Validiert, sofort verworfen — nicht gespeichert, nicht gehasht, nicht geloggt.

**Admin**: Offener clientseitiger Umschalter in `components/admin/AdminGate.tsx`; kein Schutz.

**Ergebnis-Display**: Immer Netto (`returnMinor − stakeMinor`).

## Verbotene Dark Patterns

Autoplay, Turbospin, betonter Near Miss, Loss Disguised as Win, vorausgewählte Bonusoptionen, Ton, Druck-Countdowns, künstliche Verknappung, Gewinnversprechen, Strategieempfehlungen, Tracking, Analytics, reale Marken, Personenfotos.

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

**Tokens** (nur diese; keine Hex-Werte): `bg-surface`, `text-primary`, `text-muted`, `border-border-subtle`, `border-border-control`, `text-teal`, `text-gold`, `text-success`, `text-warning`, `text-danger`. Gold ist knapp (max. eine Fläche/Screen, belegt vom Start-Button); Engine-Elemente Umriss oder Text.

## Tests

Vitest + jsdom, Setup `test/setup.ts`, Alias `@` → Root.

Tests koloziert als `*.test.ts`/`*.test.tsx`; projektweite Tests in `test/catalog.test.ts`.

Konfiguration: `globals: true`, `testTimeout: 120_000` (Millionen-Runden-RTP-Simulationen). Keine CI, kein E2E-Framework installiert.

## Sprache & Ton

UI-Texte und Code-Kommentare: **Deutsch**, sachlich, keine Werbesprache, keine Ausrufezeichen.

Fehlermeldungen: "Was passiert → Was tun", ohne Entschuldigung, ohne Stacktrace.

Kommentare: Erklären das Warum.

## Nicht vorhanden

Kein Backend, keine Datenbank, kein `src/`-Verzeichnis, kein `.env`, keine CI-Workflows, keine `.github/`, kein E2E-Framework (Playwright/Cypress), kein ORM, keine Server Actions, keine Route Handler, keine Middleware, kein `docs/`-Verzeichnis, keine `config/`.

## Weitere Ressourcen

- `README.md` — Schnellstart, Verzeichnisübersicht, Entscheidungstabelle, Abschnitt "Bewusst nicht vorhanden", Kurzanleitung "Neue Spiel-Engine hinzufügen"
- `ENGINE-BRIEF.md` — Engine-Spezifikation, verbindlicher Rahmen für Engine-Implementierungen (harte Regeln, Architektur, Tests, Dateigrenzen)
- `PRUEFLISTE.md` — Manuelle QA-/Durchgangs-Checkliste
- `BERICHT.md` — Abschlussbericht mit Stand und Begründungen
- `velora-konzept.md`, `velora-implementierungs-prompt.md` — Ursprungsspezifikationen
- `.claude/rules/ecc/common` — Projekt-unabhängige Standards (Git, Testing, Security, Code-Review, Coding-Style, Development-Workflow)
- `.claude/rules/ecc/typescript` — TypeScript-spezifische ECC-Standards
