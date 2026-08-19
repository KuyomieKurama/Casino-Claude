# Zusammenarbeit mehrerer Agenten

**Version 1.0 | Gültig ab: 2026-08-19**

Dieses Dokument definiert Rollen, Regeln und Ablauf für die sichere, parallele Zusammenarbeit mehrerer Agenten im selben Arbeitsverzeichnis.

## Hintergrund: Ein realer Vorfall

Drei Agenten liefen gleichzeitig im selben Arbeitsverzeichnis mit überlappenden Dateibereichen:
- Agent A führte `git stash` aus, um die Verlaufshistorie zu inspizieren. Das erfasste die uncommittete Arbeit aller drei Agenten.
- Agent B führte `git reset` durch; der Arbeitsbaum wurde mehrfach zurückgesetzt.
- Agent C hatte zwei Dateien, deren Arbeit von Agent B zurückgesetzt wurde — mit fremden Änderungen darin.
- Unterm Strich: Drei parallele Agenten waren langsamer als drei nacheinander, und die Fehlerbehandlung war aufwändig (nur Backups retteten die Arbeit).

Diese Erfahrung ist die Grundlage aller folgenden Regeln.

## Rollen

### Koordinator
- **Aufgabe**: Schneidet Aufgaben zu, verteilt sie, koordiniert parallele Arbeit, führt Ergebnisse zusammen.
- **Schreibzugriff**: Nur auf `package.json`, `package-lock.json`, `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, `lib/constants.ts`, `CLAUDE.md` (gemeinsame Dateien) und am Schluss Commits.
- **Lesezugriff**: Alle Dateien (um Schnittmengen zu prüfen).
- **Git-Operationen**: `commit`, `push` — keine `stash`, `checkout`, `reset`, `restore`, `clean`.
- **Anzahl parallel**: Genau einer pro Projekt.

### Entwickler
- **Aufgabe**: Schreibt Code und Unit-Tests für zugewiesene Dateien.
- **Schreibzugriff**: Nur auf die **schriftlich zugeteilte, disjunkte** Dateimenge.
- **Lesezugriff**: Alle Dateien.
- **Testlauf**: Nur die `npm test` der betroffenen Dateien oder ein fest definierter Subset.
- **Git-Operationen**: Keine (Koordinator committed).
- **Anzahl parallel**: Zwei bis drei, aber **nur wenn Dateilisten vollständig disjunkt sind** (kein Überschneid mit anderen Entwicklern oder Koordinator).

### Verifizierer
- **Aufgabe**: Läuft nach Fertigstellung `npm run test:full`, `npm run typecheck`, `npm run lint`, `npm run build`.
- **Schreibzugriff**: Keine.
- **Lesezugriff**: Alle Dateien.
- **Git-Operationen**: Nur Lesebefehle (`git status`, `git diff`).
- **Anzahl parallel**: Genau einer — mehrere würden dasselbe prüfen.

### Fachprüfer (Read-Only)
- **Aufgabe**: Code-Review nach Fachbereich (TypeScript, React, Sicherheit, Datenbank, Fehlerbehandlung, etc.).
- **Schreibzugriff**: Keine.
- **Lesezugriff**: Alle Dateien.
- **Git-Operationen**: Nur Lesebefehle.
- **Anzahl parallel**: Unbegrenzt — kostenlos, weil schreiblos.
- **Sichtbarkeit**: Arbeitet auf dem `feat/*`-Branch nach Koordinator-Commit.

### Kritiker (Read-Only)
- **Aufgabe**: Zerlegt Pläne vor der Umsetzung, sucht Risiken, fehlende Fälle, unklare Anforderungen.
- **Schreibzugriff**: Keine.
- **Lesezugriff**: Spezifikation, Tickets, Anforderungen.
- **Anzahl parallel**: Unbegrenzt.
- **Sichtbarkeit**: Arbeitet vor dem Entwickler-Start.

## Verbindliche Regeln

### Regel 1: Ein schreibender Besitzer je Datei
Vor dem Start einer Aufgabe:
1. Koordinator erstellt eine **Dateimatrix**: für jeden parallelen Agenten die Liste von Dateien, auf die nur dieser Agent schreiben darf.
2. Koordinator **prüft Schnittmengen**: Überschneidet sich eine Datei in mehreren Listen oder mit den gemeinsamen Dateien, wartet der später startende Agent.
3. **Eintrag ins Logbuch** (im .claude-Memory oder Task-Tracker): „Entwickler X: 12:30 Uhr bis 13:45 Uhr, Dateien: `lib/foo.ts`, `components/Bar.tsx`".

**Ausnahme**: Gemeinsame Dateien werden nur vom Koordinator in einem isolierten Schritt (ohne parallele Entwickler) geändert.

### Regel 2: Kein Agent verändert Git-Zustand
Folgende Kommandos sind **untersagt** für alle Agenten außer Koordinator nach Fertig-Meldung:
- `git stash` — betrifft alle uncommittierten Dateien
- `git checkout [--]` — zurücksetzen von Dateien
- `git restore` — gleiches wie `checkout --`
- `git reset` — zurücksetzen des Index oder HEAD
- `git clean -f` — Löschen ungetackter Dateien
- `npm install` — verändert `package-lock.json`
- `npm dedupe` — verändert Abhängigkeitsbaum

**Erlaubt**: `git status`, `git diff`, `git log` (Lesebefehle).

### Regel 3: Gemeinsame Dateien gehören dem Koordinator
Diese Dateien sind **schreibgesperrt** für Entwickler:
- `package.json` — wird nur vom Koordinator gepflegt
- `package-lock.json` — autom. durch `npm install` (Koordinator)
- `vitest.config.ts` — Testrahmen
- `eslint.config.mjs` — Lint-Regeln
- `tsconfig.json` — Compiler-Einstellungen
- `next.config.ts` — Next.js-Konfiguration
- `lib/constants.ts` — gemeinsame Konstanten
- `CLAUDE.md` — Projekt-Anweisungen
- `.env.example` — Template (echte Geheimnisse nur in `.env.local`, nicht committed)

Änderungen daran gehen nur über den Koordinator in einem separaten Commit-Schritt.

### Regel 4: Worktrees bevorzugen
Braucht ein Entwickler Zugriff auf breite oder überlappende Bereiche (z. B. Refactoring über viele Module), bekommt er eine **separate Arbeitskopie** statt des gemeinsamen Baums:
```bash
git worktree add -b feat/refactor-db ./worktree-db origin/master
cd ./worktree-db
# Arbeit hier, isoliert vom Hauptbaum
```
Das Agent-Werkzeug unterstützt `--worktree`-Flag für genau diesen Zweck.

### Regel 5: Parallelität nur bei echtem Schnitt
- Zwei Agenten parallel: ja, wenn Dateiadressen zu 0 % überlappen.
- Drei Agenten parallel: nur wenn alle drei disjunkte Bereiche haben (z. B. A: lib/foo.ts, B: components/Bar.tsx, C: server/baz.ts).
- **Ohne saubere Trennung**: Agenten werden langsamer, nicht schneller — Koordination ist teurer als sequenzieller Ablauf.

### Regel 6: Read-Only-Rollen dürfen parallel laufen
Fachprüfer, Kritiker und Verifizierer konkurrieren nicht um Schreibzugriff:
- Mehrere Fachprüfer parallel: ja, immer.
- Verifizierer während Entwicklung: nein (wird nach dem Koordinator-Commit ausgeführt).

## Ablauf je Aufgabe

```
1. SPEZIFIKATION
   ├─ Kritiker (Read-Only): zerlegt den Plan
   └─ Koordinator: nimmt Feedback auf, finalisiert Anforderung

2. PLANUNG
   ├─ Koordinator: erstellt Dateimatrix
   └─ Koordinator: prüft Schnittmengen, teilt zu

3. ENTWICKLUNG (parallel, wo möglich)
   ├─ Entwickler 1: schreibt auf zugeteilte Dateien
   ├─ Entwickler 2: schreibt auf zugeteilte Dateien (disjunkt von 1)
   ├─ Entwickler 3: schreibt auf zugeteilte Dateien (disjunkt von 1 und 2)
   └─ Koordinator: wartet auf Fertig-Meldungen

4. ZUSAMMENFÜHRUNG
   ├─ Koordinator: mergt lokale Änderungen aller Entwickler
   └─ Koordinator: committet mit `git commit` (keine `git stash`!)

5. VERIFIKATION
   ├─ Verifizierer (genau einer): `npm run test:full`, `npm run typecheck`, `npm run lint`, `npm run build`
   └─ Verifizierer: meldet Befunde oder OK

6. REVIEW (parallel)
   ├─ Fachprüfer 1 (TypeScript/React): reads, comments
   ├─ Fachprüfer 2 (Sicherheit): reads, comments
   └─ Fachprüfer 3 (Datenbank): reads, comments

7. KORREKTUR (falls nötig)
   ├─ Entwickler: behebt Befunde
   └─ Koordinator: committet zweiten Durchgang
```

## Praktische Checkliste für Koordinator

- [ ] Plan fertig und durch Kritiker reviewed
- [ ] Dateimatrix erstellt: für jeden Entwickler exakt eine Liste
- [ ] Schnittmengen überprüft: 0 Überschneidungen
- [ ] Gemeinsame Dateien identifiziert: niemand außer mir schreibt dort
- [ ] Startsignal gegeben: Entwickler können starten
- [ ] Laufzeit-Monitor: Fortschritt tracking
- [ ] Fertig-Meldung erhalten: alle Entwickler fertig
- [ ] Änderungen zusammengefasst (NICHT via `git stash`): lokal merged
- [ ] Commit erstellt: `git commit` mit aussagekräftiger Nachricht
- [ ] Verifizierer gestartet: `npm run test:full` + Lint + Typecheck
- [ ] Befunde addressiert: keine CRITICAL/HIGH issues
- [ ] Fachprüfer aktiviert: Code review gestartet
- [ ] Push (nach OK): `git push`

## Troubleshooting

**Problem**: Zwei Agenten editieren Datei X.
→ **Lösung**: Einer wartet, bis der andere committed (Regel 1, Schnittmenge-Prüfung).

**Problem**: Ein Agent führte `git stash` aus.
→ **Lösung**: STOP. Koordinator prüft `git stash show`, `git stash pop`, stellt sicher, dass keine fremden Änderungen verloren gingen. Nächster Agent braucht Worktree.

**Problem**: Ein Entwickler braucht doch noch eine Datei, die ein anderer bearbeitet.
→ **Lösung**: Koordinator-Pause. Dateimatrizen anpassen, einen Agent pausieren, oder Worktree für den einen ausgeben.

**Problem**: Verifizierer findet CRITICAL Issue.
→ **Lösung**: Entwickler behebt in separatem Branch/Worktree, Koordinator committet Hotfix, Verifizierer neu.

## Testergebnisse: npm test Splits

Damit Entwickler während der Arbeit schnell Feedback erhalten:

```bash
npm test                 # Schnell: ohne lange RTP-Simulationen (~120 Sekunden)
npm run test:rtp         # Nur RTP-Belege (~18 Sekunden der Rein-Simulation)
npm run test:full        # Alles (Verifikation, CI/CD) (~127 Sekunden)
npm run test:watch       # Watch-Modus mit Standard-Config
```

Siehe `CLAUDE.md` für Details.

---

**Dieses Dokument ist verbindlich.** Abweichungen erfordern explizite Genehmigung durch den Koordinator und müssen ins Logbuch eingetragen werden.
