# velora-casino-demo: Produktionsinstallation

Anleitung zur Installation und zum Betrieb von velora-casino-demo v0.1.0 auf **Ubuntu 22.04 LTS / 24.04 LTS** oder **Debian 12 (Bookworm)**.

Diese Anleitung richtet sich an Administratoren, die Linux bedienen können, dieses Projekt aber nicht kennen.

## Überblick und Komponenten

**Velora-casino-demo** ist eine Fullstack-Anwendung:

- **Frontend**: Next.js 15.5.23 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend**: Node.js-Server, better-auth (Authentifizierung, OAuth, Sessions)
- **Datenbank**: PostgreSQL 17 mit Drizzle ORM
- **Tests**: Vitest (1026 Tests)
- **Statischer Export nicht möglich**: Die Anwendung benötigt eine laufende Node.js-Umgebung und Datenbankverbindung

**Was nach der Installation läuft:**
- HTTP-Server auf Port 3000 (wird durch Reverse Proxy nach HTTPS vermittelt)
- PostgreSQL-Datenbankserver
- Seed-Daten: 6 Anbieter, 19 Spieltitel, 24 Spielmodi

**Node.js-Anforderung**: Die `package.json` nennt keine starre Engine-Anforderung. Das Projekt wurde gegen Node 22 entwickelt (siehe README.md) — empfohlen ist **Node 22.7 oder neuer**. Node 20 wird nicht getestet.

## Systemvorbereitung (Ubuntu/Debian)

### Paketquellen und Grundpakete

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y \
  curl \
  git \
  build-essential \
  openssl \
  postgresql-client-17 \
  nginx
```

`postgresql-client-17` wird für `psql` und `pg_dump` benötigt (auch wenn PostgreSQL selbst in Docker läuft).

### Unprivilegierter Systembenutzer

```bash
sudo useradd --system --no-create-home --shell /bin/false velora
sudo mkdir -p /opt/velora
sudo chown velora:velora /opt/velora
sudo chmod 750 /opt/velora
```

Die Anwendung läuft später **nicht als root**, sondern als Benutzer `velora`. Root ist für die Verzeichnisverwaltung und Service-Setup nötig, nicht für die Ausführung.

> **Stolperstein: Dienstbenutzer ohne Home-Verzeichnis**
>
> `--no-create-home` ist für einen reinen Dienstbenutzer richtig (kein Login, keine Shell-Historie
> nötig) — bricht aber später bei `npm ci` mit `EACCES: permission denied, mkdir '/home/velora'`
> ab: npm legt seinen Cache standardmäßig unter `$HOME/.npm` an, und `velora` hat kein `$HOME`.
>
> **Abhilfe**, eine der beiden Varianten wählen:
>
> ```bash
> # Variante A: Home-Verzeichnis nachträglich anlegen und HOME beim Aufruf setzen
> sudo mkdir -p /home/velora
> sudo chown velora:velora /home/velora
> sudo -H -u velora npm ci   # -H setzt $HOME für den velora-Aufruf korrekt
>
> # Variante B: npm-Cache explizit umleiten, kein Home-Verzeichnis nötig
> sudo -u velora npm ci --cache /opt/velora/.npm-cache
> ```
>
> **Wichtig, unabhängig von der gewählten Variante:** Jeder folgende Befehl in diesem Kapitel
> (`npm run db:migrate`, `npm run db:seed`, `npm run build`, …) muss **als derselbe Benutzer**
> mit derselben `$HOME`/Cache-Konfiguration laufen wie `npm ci`. Wechselt der Benutzer zwischendurch
> (z. B. ein Befehl versehentlich als root statt `sudo -u velora`), entstehen gemischte
> Dateibesitzer in `node_modules/` und `~/.npm`. `npm ci` kann `node_modules` dann bei einem
> späteren Lauf nicht mehr sauber aufräumen und bricht mit verwirrenden Berechtigungsfehlern ab —
> Abhilfe in diesem Fall: `sudo rm -rf node_modules` und `npm ci` als korrekt konsistenter
> Benutzer erneut ausführen.

## Node.js 22 installieren

Zwei empfohlene Optionen:

### Option A: NodeSource PPA (Produktion — empfohlen)

Nur für stabile Releases:

```bash
# Repository hinzufügen (Ubuntu/Debian-kompatibel)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Vorteil: Standard-Paketmanager, zentrale Verwaltung, automatische Sicherheitsupdates.
Nachteil: Nur eine aktive Hauptversion gleichzeitig installierbar.

**Verifikation:**
```bash
node --version   # sollte v22.x.x sein
npm --version    # sollte 10.x oder neuer sein
```

### Option B: nvm (Entwicklung/Mehrversion-Szenarien)

Wenn mehrere Node-Versionen nebeneinander benötigt werden:

```bash
# nvm installieren
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Shell neuladen oder diese Befehle manuell aufrufen:
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Node 22 installieren
nvm install 22
nvm use 22

# Standard-Version für zukünftige Terminals setzen
nvm alias default 22
```

Vorteil: Schneller Switch zwischen Versionen, pro Benutzer installierbar.
Nachteil: Zusätzliches Tool; jeder Benutzer, der die App aufruft, muss nvm initialisieren.

**Verifikation (für Benutzer `velora`):**

Wenn via nvm: Stelle sicher, dass `velora` selbst Node nicht aufruft; der systemd-Service wird Node via vollständigem Pfad laden.

---

## PostgreSQL-Datenbankserver

Zwei Wege, je nach Anforderung.

### PostgreSQL nativ (empfohlen für Produktion)

#### Installation und Dienst

```bash
# PostgreSQL-Server installieren
sudo apt install -y postgresql postgresql-contrib

# Dienst starten und dauerhaft aktivieren
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Status prüfen
sudo systemctl status postgresql
```

#### Datenbankbenutzer und Datenbank anlegen

```bash
# Als root in die postgres-Shell wechseln
sudo -u postgres psql

# Folgende SQL-Befehle ausführen (Prompt: postgres=#)
CREATE ROLE velora WITH LOGIN PASSWORD 'velora_secure_pwd_here' CREATEDB;
CREATE DATABASE velora OWNER velora;

# Sitzung beenden
\q
```

**Passwort setzen**: Ersetze `velora_secure_pwd_here` durch ein Zufallspasswort:

```bash
SECURE_PWD=$(openssl rand -base64 32)
echo "Passwort: $SECURE_PWD"
```

Notiere dieses Passwort — es wird für `DATABASE_URL` benötigt.

#### Zugriff prüfen

```bash
# Lokale Verbindung ohne Passwort (Peer-Auth, nächste Zeile zeigt "velora" am Prompt)
sudo -u velora psql -d velora -c "SELECT 1;"

# Mit Passwort (entfernte Verbindungen, Reverse Proxy später)
psql -U velora -d velora -h localhost -W
# Passwort eingeben; mit Prompt `velora=>` bestätigt, dann \q
```

#### Optional: PostgreSQL für externe Verbindungen freigeben

Nur, wenn die Anwendung von einem anderen Host aus auf PostgreSQL zugreift (nicht empfohlen — lokal ist sicherer):

```bash
# Konfiguration bearbeiten
sudo nano /etc/postgresql/17/main/postgresql.conf

# Zeile mit listen_addresses ändern zu:
# listen_addresses = '*'
# (oder spezifische IPs, z. B. 192.168.1.10)

# Dann pg_hba.conf anpassen (erlaubte Clients):
sudo nano /etc/postgresql/17/main/pg_hba.conf

# Am Ende hinzufügen (z. B. für Lokal-Netz 192.168.1.0/24):
# host    velora    velora    192.168.1.0/24    md5

# Dienst neustarten
sudo systemctl restart postgresql
```

**Sicherheit**: Der App-Server sollte **auf dem gleichen Host** wie PostgreSQL laufen. Falls nicht, verwende nur vertrauenswürdige Netze und aktiviere SSL für Datenbankverbindungen.

---

### PostgreSQL in Docker (bequem für Entwicklung/Staging)

Wenn Docker und Docker Compose bereits vorhanden sind:

```bash
# Im Projekt-Verzeichnis:
cd /opt/velora/velora-casino-demo

# .env.local mit Datenbankzugangsdaten erstellen (siehe Abschnitt .env.local)
# Annahme: DATABASE_URL=postgresql://velora:velora@localhost:5432/velora

# Docker-Service starten
docker compose up -d

# Logs prüfen
docker compose logs -f postgres
```

Das `docker-compose.yml` des Projekts startet PostgreSQL 17 Alpine mit Volumen-Persistierung.

**Zugangsdaten aus docker-compose.yml:**
```
POSTGRES_USER: velora
POSTGRES_PASSWORD: velora
POSTGRES_DB: velora
Port: 5432
```

Diese müssen in `.env.local` als `DATABASE_URL` zusammengefasst werden: `postgresql://velora:velora@localhost:5432/velora`.

---

### DATABASE_URL zusammensetzen

Format:
```
postgresql://[benutzer]:[passwort]@[host]:[port]/[datenbank]
```

Beispiele:

**Nativ lokal:**
```
postgresql://velora:velora_secure_pwd_here@localhost:5432/velora
```

**Docker lokal:**
```
postgresql://velora:velora@localhost:5432/velora
```

**Auf anderem Host (nicht empfohlen):**
```
postgresql://velora:passwort@db.internal.example.com:5432/velora
```

**Sonderzeichen im Passwort URL-kodieren:**

Passwort: `foo@bar#baz`
→ URL-kodiert: `foo%40bar%23baz`
→ DATABASE_URL: `postgresql://velora:foo%40bar%23baz@localhost:5432/velora`

Häufige Sonderzeichen:
- `@` → `%40`
- `#` → `%23`
- `:` → `%3A`
- `/` → `%2F`
- `?` → `%3F`

---

## Anwendung einrichten

### Quellcode holen

```bash
cd /opt/velora
sudo -u velora git clone https://github.com/your-org/velora-casino-demo.git
cd velora-casino-demo

# Branch zur Verfügung stellen (z. B. feat/produktionsreife)
sudo -u velora git checkout feat/produktionsreife
```

### Abhängigkeiten installieren

```bash
cd /opt/velora/velora-casino-demo

# npm ci (nicht npm install!) — deterministische Lock-Datei, keine Versionsdrift
sudo -u velora npm ci
```

**Warum `npm ci` statt `npm install`?**
- `npm install` verhandelt Versionen neu, kann alte `package-lock.json` ignorieren
- `npm ci` (Continuous Integration) installiert **exakt** die in `package-lock.json` festgehaltenen Versionen
- In der Produktion garantiert das: der App-Code unterscheidet sich nicht zwischen Entwicklung und Produktion wegen Versionsdrift

> **Stolperstein: Blockierte Install-Scripts**
>
> Neuere npm-Versionen blockieren `postinstall`-Skripte von Abhängigkeiten standardmäßig
> (Sicherheitsmaßnahme gegen bösartige Pakete). Betroffen sind hier unter anderem `esbuild`,
> `sharp` und `unrs-resolver` — alle drei werden zur Laufzeit bzw. beim Build tatsächlich
> gebraucht (native Binaries laden). Ohne deren Install-Skripte startet die Anwendung nicht
> zuverlässig oder der Build schlägt an unerwarteter Stelle fehl.
>
> **Prüfen, welche Skripte blockiert wurden:**
> ```bash
> npm install-scripts ls
> ```
>
> **Freigeben (pro Paket) und danach neu installieren:**
> ```bash
> npm install-scripts approve esbuild
> npm install-scripts approve sharp
> npm install-scripts approve unrs-resolver
>
> # Nach jeder Freigabe erneut installieren, damit das Skript tatsächlich läuft:
> sudo -u velora npm ci
> ```
>
> Ohne den erneuten `npm ci`-Lauf bleibt das Paket installiert, aber ohne die vom Skript
> erzeugten Artefakte (z. B. heruntergeladene native Binaries) — der Fehler zeigt sich dann erst
> beim Start oder Build, nicht bei der Installation selbst.

> **Warnung: `npm audit fix --force` nicht verwenden**
>
> `npm audit fix --force` ignoriert die in `package-lock.json` festgehaltenen Versionsgrenzen und
> kann Pakete auf inkompatible Hauptversionen herunter- oder hochstufen. Auf dem Testserver hat
> es `drizzle-kit` von `0.31.10` auf `0.18.1` **heruntergestuft** — dabei verschwand der
> `migrate`-Befehl aus dieser älteren Version vollständig, wodurch sowohl `npm run db:migrate`
> als auch `npm run db:seed` (das intern eine Migration voraussetzt) fehlschlugen, ohne dass der
> Zusammenhang mit dem vorangegangenen `audit fix` beim Fehler selbst erkennbar war.
>
> **Empfehlung:** Statt `--force` zunächst nur bewerten, welche Schwachstellen überhaupt
> produktionsrelevant sind (Dev-Abhängigkeiten wie Test-Tooling zählen hier meist nicht):
> ```bash
> npm audit --omit=dev
> ```
> Einzelne Pakete danach gezielt und bewusst aktualisieren (`npm install <paket>@<version>`),
> nicht pauschal per `--force`.

### Umgebungsvariablen (.env.local)

```bash
cd /opt/velora/velora-casino-demo

# Vorlage kopieren
sudo -u velora cp .env.example .env.local

# Bearbeiten
sudo nano .env.local
```

Folgende Variablen **müssen** gesetzt werden:

#### Pflicht: DATABASE_URL

```
DATABASE_URL=postgresql://velora:velora@localhost:5432/velora
```

Prüfen: `psql -U velora -d velora -h localhost -c "SELECT 1;"`

#### Pflicht: BETTER_AUTH_SECRET

```bash
# Zufallswert erzeugen
openssl rand -base64 32
```

In `.env.local`:
```
BETTER_AUTH_SECRET=<hier 32+ zufällige Zeichen einfügen, z. B. aus openssl>
```

**Wichtig**: Diesen Wert **nie** einchecken, nicht im Team teilen, pro Umgebung verschieden.

#### Pflicht: BETTER_AUTH_URL

```
BETTER_AUTH_URL=https://velora.example.com
```

**In Produktion (NODE_ENV=production):** Muss mit `https://` beginnen. better-auth leitet daraus ab, ob Session-Cookies das `Secure`-Attribut bekommen. Eine `http://`-URL in Produktion würde die Absicherung stillschweigend deaktivieren, ohne dass das an anderer Stelle auffällt — das wird daher von `lib/env.ts` beim Start erzwungen.

**Lokal/Entwicklung:** `BETTER_AUTH_URL=http://localhost:3000` ist erlaubt.

**Wichtig**: Diese URL muss mit der tatsächlichen Adresse übereinstimmen, unter der die Anwendung erreichbar ist. Falsche Werte führen zu "Anmeldung fehlgeschlagen" oder OAuth-Fehler.

#### Optional: NODE_ENV

```
NODE_ENV=production
```

Standard: `development`. Nur auf `production` setzen, wenn der Server wirklich öffentlich läuft.

#### Optional: ADMIN_BOOTSTRAP_EMAIL

```
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
```

Diese E-Mail-Adresse erhält beim Seed-Lauf automatisch Admin-Rechte. **Muss eine gültige E-Mail sein, die auch im Konto registriert ist.** Ohne gesetzten Wert: kein Admin wird automatisch erzeugt, Admin-Rechte werden nur hier vergeben (nirgends sonst in der Anwendung).

#### Optional: OAuth

Google, GitHub und Discord sind optional. Sie brauchen **ID und Secret zusammen** — ohne beide bleibt der Provider inaktiv.

```
OAUTH_GOOGLE_CLIENT_ID=<von Google Console>
OAUTH_GOOGLE_CLIENT_SECRET=<von Google Console>
OAUTH_GITHUB_CLIENT_ID=<von GitHub>
OAUTH_GITHUB_CLIENT_SECRET=<von GitHub>
OAUTH_DISCORD_CLIENT_ID=<von Discord>
OAUTH_DISCORD_CLIENT_SECRET=<von Discord>
```

#### Optional: TRUSTED_PROXY_IPS

```
TRUSTED_PROXY_IPS=
```

Standardmäßig leer lassen (sicherer). Siehe Abschnitt "Reverse Proxy und HTTPS" für die Erklärung.

### Dateirechte

`.env.local` enthält Geheimnisse und darf nur von `velora` lesbar sein:

```bash
sudo chmod 600 /opt/velora/velora-casino-demo/.env.local
sudo chown velora:velora /opt/velora/velora-casino-demo/.env.local
```

---

> **`npm run db:migrate` und `npm run db:seed` laden `.env`/`.env.local` selbst**
>
> Nur Next.js selbst lud `.env`/`.env.local` bislang automatisch beim Start (`npm run dev`,
> `npm run build`, `npm start`). `drizzle-kit` (hinter `npm run db:migrate` und `npm run
> db:generate`) und das eigenständige Seed-Skript (`npm run db:seed`, hinter
> `server/seed/run-seed.ts`) sind reine Node-Skripte ohne den Next.js-eigenen Lademechanismus —
> `drizzle.config.ts` liest `process.env.DATABASE_URL` direkt. Deshalb übergeben die beiden
> npm-Skripte in `package.json` Node selbst die Flags `--env-file-if-exists=.env` und
> `--env-file-if-exists=.env.local` (Node 22, kein zusätzliches Paket nötig). Geprüftes Verhalten
> (Node 22.23.2):
> - Fehlt eine der beiden Dateien, bricht der Aufruf **nicht** ab — Node überspringt sie
>   kommentarlos. Fehlt `DATABASE_URL` am Ende trotzdem, erscheint weiterhin die gewohnte
>   Fehlermeldung „DATABASE_URL fehlt …".
> - `.env.local` hat Vorrang vor `.env` (dieselbe Rangfolge wie bei Next.js), weil es als
>   letztes der beiden Flags übergeben wird — bei doppelten Schlüsseln gewinnt die zuletzt
>   geladene Datei.
> - Eine bereits in der Prozessumgebung gesetzte Variable (z. B. via systemd
>   `EnvironmentFile=.env.local`, siehe Abschnitt „Service-Datei") wird **nicht** überschrieben —
>   die Datei ergänzt nur, was in der Umgebung noch fehlt.
>
> `sudo -u velora npm run db:migrate` bzw. `db:seed` funktionieren dadurch ohne vorheriges
> `source .env.local` und ohne `--preserve-env`:
> ```bash
> cd /opt/velora/velora-casino-demo
> sudo -u velora npm run db:migrate
> sudo -u velora npm run db:seed
> ```
>
> **Fallback**, falls die Zugangsdaten in einer abweichend benannten Datei liegen (z. B.
> `.env.production`) — dafür greift keins der beiden Flags automatisch, die Umgebung muss dann
> weiterhin manuell vorgeschaltet werden:
> ```bash
> cd /opt/velora/velora-casino-demo
> set -a   # danach exportiert `source` automatisch jede gesetzte Variable in die Umgebung
> source .env.production
> set +a
>
> sudo -u velora --preserve-env npm run db:migrate
> sudo -u velora --preserve-env npm run db:seed
> ```
> `--preserve-env` ist auch hier nötig, weil `sudo` die Umgebung sonst zurücksetzt und die gerade
> per `source` geladenen Variablen wieder verwirft.

### Datenbank initialisieren

```bash
cd /opt/velora/velora-casino-demo
sudo -u velora npm run db:migrate
```

**Was passiert:**
- Drizzle-Kit liest `server/db/migrations/*.sql` (6 Migrationen: Katalog, Auth-Schema, Indizes, Rollen)
- Wendet sie nacheinander auf PostgreSQL an
- Befähigt die Anwendung, auf Tabellen wie `provider`, `game`, `user`, `session` etc. zuzugreifen

**Fehlerbehandlung:**
- `ECONNREFUSED localhost:5432`: PostgreSQL läuft nicht; prüfe `systemctl status postgresql` oder `docker compose logs`
- `role "velora" does not exist`: Benutzer nicht angelegt; siehe Abschnitt PostgreSQL
- `DATABASE_URL fehlt`, obwohl `.env.local` befüllt ist: Datei liegt nicht im aktuellen Arbeitsverzeichnis (`cd /opt/velora/velora-casino-demo` fehlt) oder trägt einen abweichenden Namen — siehe Kasten oben für den Fallback mit manuellem `source`

---

### Datenbank mit Testdaten befüllen (Seed)

```bash
cd /opt/velora/velora-casino-demo
sudo -u velora npm run db:seed
```

**Was wird geseedet:**
- 6 Spielanbieter (Velora Studios, Northgate Play, Kessel & Sonne, Halbmond Interactive, Tessera Games, Fünf Türme Studio — frei erfundene Studios nach Regel 8, keine realen)
- 19 Spieltitel mit verschiedenen Kategorien (11 Slots, Video Poker, Plinko, Mines, Dice, Wheel, plus Roulette, Blackjack, Baccarat)
- 24 Spielmodi pro Titel (z. B. Roulette mit 3 Spielmodi: Europäisch, Amerikanisch, Live)

**Idempotenz**: Ein zweiter Seed-Lauf ändert die Zahl der Zeilen nicht (Upsert auf Primärschlüssel). Das ist sicher zu wiederholen.

**ADMIN_BOOTSTRAP_EMAIL verarbeiten:**

Falls `ADMIN_BOOTSTRAP_EMAIL=admin@example.com` gesetzt ist und ein Konto mit dieser E-Mail bereits existiert (via Registrierung in der Anwendung), wird es jetzt zum Admin befördert:

```bash
# Terminal-Ausgabe:
# Seed abgeschlossen: 6 Anbieter, 19 Titel, 24 Modi.
# Admin-Bootstrap: „admin@example.com" ist jetzt Admin.
```

Falls das Konto noch nicht existiert:
```bash
# Admin-Bootstrap: Kein Konto mit „admin@example.com" gefunden — zuerst regulär registrieren, dann erneut seeden.
```

→ Konto manuell über `/register` anlegen, dann `npm run db:seed` erneut aufrufen.

---

## OAuth einrichten

OAuth ist optional. Passwort-basierte Registrierung und Anmeldung funktionieren immer.

Für jeden Provider (Google, GitHub, Discord) müssen **sowohl Client ID als auch Secret** in `.env.local` eingetragen sein. Fehlt eines der beiden, ist der Provider inaktiv und wird nicht in der Anwendung angezeigt.

### Google

1. **Google Cloud Console öffnen:** https://console.cloud.google.com/
2. **OAuth 2.0 Credentials erstellen:**
   - APIs & Services → Credentials
   - Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs hinzufügen:
     ```
     https://velora.example.com/api/auth/callback/google
     https://localhost:3000/api/auth/callback/google (für lokal)
     ```
   - Client ID und Secret kopieren

3. **In `.env.local` eintragen:**
   ```
   OAUTH_GOOGLE_CLIENT_ID=<Client ID>
   OAUTH_GOOGLE_CLIENT_SECRET=<Client Secret>
   ```

### GitHub

1. **GitHub Settings öffnen:** https://github.com/settings/developers
2. **New OAuth App:**
   - Application name: velora-casino-demo (oder beliebig)
   - Homepage URL: `https://velora.example.com`
   - Authorization callback URL: `https://velora.example.com/api/auth/callback/github`
3. **Client ID und Secret kopieren**

4. **In `.env.local` eintragen:**
   ```
   OAUTH_GITHUB_CLIENT_ID=<Client ID>
   OAUTH_GITHUB_CLIENT_SECRET=<Client Secret>
   ```

### Discord

1. **Discord Developer Portal öffnen:** https://discord.com/developers/applications
2. **New Application:**
   - Name: velora-casino-demo (oder beliebig)
   - OAuth2 → General
   - Client ID und Client Secret kopieren
3. **Redirect URIs hinzufügen:**
   ```
   https://velora.example.com/api/auth/callback/discord
   ```

4. **In `.env.local` eintragen:**
   ```
   OAUTH_DISCORD_CLIENT_ID=<Client ID>
   OAUTH_DISCORD_CLIENT_SECRET=<Client Secret>
   ```

---

**Callback-URL allgemein:**

Format: `{BETTER_AUTH_URL}/api/auth/callback/{provider}`

Lokal: `http://localhost:3000/api/auth/callback/google` etc.
Produktion: `https://velora.example.com/api/auth/callback/google` etc.

**Diese URL muss exakt bei jedem Provider eintragen sein.** better-auth leitet OAuth-Antworten dorthin zurück. Eine falsche Callback-URL führt zu "Authorization mismatch" oder "Invalid redirect_uri"-Fehler.

---

## Anwendung bauen und starten

### Produktionsbuild

```bash
cd /opt/velora/velora-casino-demo
sudo -u velora npm run build
```

**Was wird ausgeführt:**
- `next build` kompiliert TypeScript → JavaScript, optimiert das Bundle, prüft auf Fehler
- Ergebnis: `.next/` Verzeichnis mit Output

**Dauer:** Typisch 30–60 Sekunden.

**Fehler:**
- Build schlägt ab, wenn eine `lib/env.ts`-Variable nicht im `.env.local` vorhanden ist oder ungültig ist
- Typen-Fehler (z. B. in einer Route Handler oder Server Component) stoppten den Build
- Fehlende Datenbankverbindung beim Build ist normal; build braucht sie nicht

### Server starten (manuell zum Testen)

```bash
cd /opt/velora/velora-casino-demo
NODE_ENV=production sudo -u velora npm start
```

**Ergebnis:**
```
> velora-casino-demo@0.1.0 start
> next start

  ▲ Next.js 15.5.23
  - Local:        http://localhost:3000
```

Server läuft auf Port 3000. Ctrl+C zum Stoppen.

---

## systemd-Service (produktiv)

Damit die Anwendung beim Boot automatisch startet und bei Fehlern neustartet, wird ein systemd-Service angelegt.

### Service-Datei erstellen

```bash
sudo tee /etc/systemd/system/velora.service > /dev/null << 'EOF'
[Unit]
Description=velora-casino-demo Node.js Application
After=network.target postgresql.service

[Service]
Type=simple
User=velora
Group=velora
WorkingDirectory=/opt/velora/velora-casino-demo
EnvironmentFile=/opt/velora/velora-casino-demo/.env.local
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /opt/velora/velora-casino-demo/node_modules/.bin/next start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
# Das Projekt darf nie als root laufen
# Die Anwendung sollte nicht auf das System zugreifen
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
```

**Erklärung der Zeilen:**
- `EnvironmentFile`: Liest `.env.local` als Umgebungsvariablen
- `User=velora`: Läuft als unprivilegierter Benutzer, nicht root
- `Restart=always`: Startet automatisch neu bei Crash
- `RestartSec=10`: 10 Sekunden Wartezeit vor Neustart
- `StandardOutput=journal`: Logs gehen ins systemd-Journal (einsehbar via `journalctl`)

### Service aktivieren und starten

```bash
sudo systemctl daemon-reload
sudo systemctl enable velora
sudo systemctl start velora
```

### Status und Logs prüfen

```bash
# Status
sudo systemctl status velora

# Live-Logs
sudo journalctl -u velora -f

# Letzte 50 Zeilen
sudo journalctl -u velora -n 50
```

**Beispiel-Ausgabe:**
```
Sep 18 10:45:23 prod node[12345]: ▲ Next.js 15.5.23
Sep 18 10:45:24 prod node[12345]: - Local: http://localhost:3000
```

---

## Reverse Proxy und HTTPS mit nginx

Die Anwendung läuft auf Port 3000 (lokal nicht erreichbar von außen). Ein Reverse Proxy (nginx) nimmt Verbindungen auf Port 80/443 entgegen und leitet sie an den App-Server weiter.

### HTTPS-Zertifikat (Let's Encrypt)

```bash
# certbot installieren
sudo apt install -y certbot python3-certbot-nginx

# Zertifikat ausstellen (interaktiv)
sudo certbot certonly --standalone -d velora.example.com
```

**Folge den Hinweisen auf dem Bildschirm.**

Zertifikat wird gespeichert unter:
- Privater Schlüssel: `/etc/letsencrypt/live/velora.example.com/privkey.pem`
- Zertifikat: `/etc/letsencrypt/live/velora.example.com/fullchain.pem`

### nginx konfigurieren

```bash
sudo tee /etc/nginx/sites-available/velora > /dev/null << 'EOF'
# HTTP → HTTPS Redirect
server {
    listen 80;
    server_name velora.example.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name velora.example.com;

    ssl_certificate /etc/letsencrypt/live/velora.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/velora.example.com/privkey.pem;

    # Moderne SSL-Einstellungen
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy-Einstellungen
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;  # WebSocket-Unterstützung
    }
}
EOF
```

**Wichtige Header in der Proxy-Konfiguration:**

- `X-Real-IP`: Client-IP (nicht nötig, wenn nur für Rate-Limiting)
- `X-Forwarded-For`: Listenliste aller Proxies
- `X-Forwarded-Proto`: `http` oder `https` (besagt dem Server, was der Client sieht)
- `Host`: Original-Host-Header

### nginx aktivieren

```bash
# Konfiguration prüfen
sudo nginx -t

# Symbolischer Link (sites-enabled)
sudo ln -sf /etc/nginx/sites-available/velora /etc/nginx/sites-enabled/velora

# nginx neustarten
sudo systemctl restart nginx

# Status
sudo systemctl status nginx
```

### HTTPS-Zwang in der Anwendung

**BETTER_AUTH_URL muss mit `https://` beginnen:**

In `.env.local`:
```
BETTER_AUTH_URL=https://velora.example.com
```

**Warum:** better-auth liest das Protokoll dieser URL und entscheidet anhand davon, ob Session-Cookies das `Secure`-Attribut bekommen (sicherer Transport). Eine `http://`-URL würde diese Absicherung still deaktivieren — deshalb wird das für `NODE_ENV=production` von `lib/env.ts` erzwungen und der Start bricht ab, falls nicht https:// vorhanden ist.

Die Anwendung selbst läuft auf `http://localhost:3000` — der Reverse Proxy terminiert TLS (verschlüsselt) und verbindet intern unverschlüsselt mit dem Server. Das ist sicher, weil nginx und die App auf dem gleichen Host laufen.

---

### TRUSTED_PROXY_IPS verstehen

Diese Variable steuert das IP-basierte Login-Rate-Limiting:

**Standardfall (Variable leer):**
```
TRUSTED_PROXY_IPS=
```
IP-basiertes Rate-Limiting ist **deaktiviert**. Nur das E-Mail-basierte Limit bleibt aktiv (5 Fehler pro E-Mail in 15 Minuten).

Warum? Ohne bekannte Proxy-Topologie kann die Anwendung nicht unterscheiden, ob der `X-Forwarded-For`-Header von einem echten Reverse-Proxy stammt oder vom Angreifer erfunden ist.

**Mit nginx auf dem gleichen Host:**

Wenn nginx und die App auf der gleichen Maschine laufen, ist `127.0.0.1` die Proxy-IP:

```
TRUSTED_PROXY_IPS=127.0.0.1
```

Das teilt der Anwendung mit: "X-Forwarded-For-Header von 127.0.0.1 sind vertrauenswürdig."

**Mit Load Balancer in anderem Netz:**

```
TRUSTED_PROXY_IPS=10.0.0.5,10.0.0.6
```
(nur die tatsächlichen IPs/Ranges des Load Balancers)

**Warnung:**
- Ein zu großer CIDR-Bereich (z. B. `TRUSTED_PROXY_IPS=10.0.0.0/8`) erlaubt jedem Host in diesem Netz, einen gefälschten `X-Forwarded-For`-Header zu setzen
- Ein falscher Wert ist **gefährlicher als ein fehlender** — das IP-Limit wird umgangen
- Im Zweifelsfall: **Variable leer lassen** (sicherer Standardwert)

---

## Betrieb

### Aktualisierung

Code-Update auf Production:

```bash
cd /opt/velora/velora-casino-demo

# Code abrufen
sudo -u velora git fetch origin
sudo -u velora git checkout main  # oder relevanter Branch
sudo -u velora git reset --hard origin/main

# Abhängigkeiten aktualisieren
sudo -u velora npm ci

# Migrationen anwenden (falls Datenbankänderungen)
sudo -u velora npm run db:migrate

# Build
sudo -u velora npm run build

# Service neu starten
sudo systemctl restart velora

# Logs prüfen
sudo journalctl -u velora -f
```

**Reihenfolge wichtig:**
1. Code
2. `npm ci`
3. `npm run db:migrate` (vor dem Build, weil Migrationen Tabellen ändern) — lädt `.env.local` inzwischen selbst (siehe Abschnitt „Datenbank initialisieren"), kein manuelles `source` mehr nötig, solange die Datei `.env.local` oder `.env` heißt
4. `npm run build`
5. `systemctl restart`

**Warnung:** `npm audit fix --force` nicht als Teil dieses Ablaufs verwenden — kann Abhängigkeiten wie `drizzle-kit` auf eine inkompatible Version herunterstufen und dabei benötigte Befehle (z. B. `migrate`) entfernen. Siehe Warnung im Abschnitt „Abhängigkeiten installieren".

---

### Datenbankwartung

#### Backup

Die Skripte `scripts/backup-db.sh` und `scripts/restore-db.sh` kapseln `pg_dump`/`pg_restore`
gegen `DATABASE_URL` (aus der Umgebung oder aus `.env`/`.env.local`, gelesen über Nodes
`--env-file-if-exists` — dieselbe Option wie bei `db:migrate`/`db:seed` in `package.json` —, nicht
per `source`). Die Bildschirmausgabe maskiert das Passwort; das Passwort selbst wird nie als
Kommandozeilenargument an `pg_dump`/`pg_restore` übergeben, sondern ausschließlich über die
Umgebungsvariable `PGPASSWORD`, damit es nicht über die Prozessliste (`/proc/<pid>/cmdline`, auf
Standard-Linux für alle lokalen Nutzer lesbar) einsehbar ist:

```bash
cd /opt/velora/velora-casino-demo
sudo -u velora npm run db:backup                          # → backups/velora_<UTC-Zeitstempel>.dump
sudo -u velora npm run db:backup -- /var/backups/velora    # alternatives Zielverzeichnis
```

`--format=custom` (`pg_dump -Fc`) ist der Standard des Skripts — kompakter als reines SQL und
kompatibel mit `pg_restore --clean --if-exists` unten. `postgresql-client-17` (siehe
„Systemvorbereitung") liefert die benötigten `pg_dump`/`pg_restore`-Binaries.

**Dump-Dateien enthalten Zugangsdaten**: `server/db/auth-schema.ts` speichert Sitzungstoken und
OAuth-Zugangstoken (`session.token`, `account.accessToken`/`refreshToken`/`idToken`) im Klartext —
ein Dump enthält diese Werte vollständig, wer ihn lesen kann, kann damit fremde Sitzungen
unmittelbar übernehmen. `scripts/backup-db.sh` setzt deshalb vor dem ersten Schreibzugriff
`umask 077`: Zielverzeichnis und Dump-Datei entstehen dadurch direkt mit den Rechten `700` bzw.
`600`, ohne Zeitfenster mit offeneren Rechten. Backups sind entsprechend wie Zugangsdaten zu
behandeln — verlassen sie diesen Host (Kopie auf ein Backup-Ziel, Transport, Archivierung),
verschlüsselt ablegen (z. B. `age`, `gpg`) statt unverschlüsselt zu übertragen.

**Empfehlung**: Vor jedem `npm run db:migrate` in Produktion ein Backup erzeugen — eine
fehlgeschlagene Migration lässt sich sonst nicht rückgängig machen.

Sicherung sollte zusätzlich täglich automatisiert erfolgen, z. B. via cron:

```bash
sudo -u velora crontab -e
# Hinzufügen (Pfade anpassen):
0 2 * * * cd /opt/velora/velora-casino-demo && npm run db:backup -- /var/backups/velora
```

Optionale Aufbewahrung (löscht ältere `*.dump`-Dateien im Zielverzeichnis automatisch):

```bash
BACKUP_RETENTION_DAYS=14 npm run db:backup -- /var/backups/velora
```

#### Wiederherstellung

**Destruktive Operation**: `scripts/restore-db.sh` läuft mit `pg_restore --clean --if-exists` und
löscht damit bestehende Objekte in der Zieldatenbank, bevor der Dump-Inhalt eingespielt wird.
Ohne `--force` fragt das Skript deshalb interaktiv nach — Ziel-Datenbank und Dump-Datei stehen
sichtbar in der Rückfrage, jede Antwort außer `ja` bricht folgenlos ab:

```bash
cd /opt/velora/velora-casino-demo
sudo -u velora npm run db:restore -- /var/backups/velora/velora_20260101T020000Z.dump
```

Für automatisierte Abläufe ohne Terminal (z. B. ein Wiederherstellungstest in einer Pipeline) nur
mit ausdrücklichem `--force`:

```bash
sudo -u velora npm run db:restore -- /var/backups/velora/velora_20260101T020000Z.dump --force
```

---

### Logs und Debugging

#### Application Logs

```bash
# Live verfolgen
sudo journalctl -u velora -f

# Letzte Einträge
sudo journalctl -u velora -n 100

# Heute, ab 10 Uhr
sudo journalctl -u velora --since "2025-09-18 10:00:00"
```

#### Datenbank-Fehler

```bash
# PostgreSQL-Logs prüfen
sudo tail -f /var/log/postgresql/postgresql-17-main.log

# Alternative: systemd-Journal
sudo journalctl -u postgresql -f
```

#### nginx Errors

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---

### Admin-Bereich

Der Admin-Bereich ist unter `/admin` erreichbar (nur für Benutzer, deren `role`-Spalte in der Datenbank `admin` ist).

**Admin-Zugang:**
1. Benutzer registriert sich via `/register`
2. Nach der Registrierung im Seed `ADMIN_BOOTSTRAP_EMAIL=<diese-email>` setzen und `npm run db:seed` erneut aufrufen
3. Benutzer ist jetzt Admin und sieht `/admin`

**Integrität prüfen** (manuell in der Datenbank):

```bash
psql -U velora -d velora -c "SELECT id, email, role FROM \"user\" WHERE role = 'admin';"
```

---

## Fehlersuche

### „Ungültige Umgebungskonfiguration. DATABASE_URL fehlt"

**Ursache:** `DATABASE_URL` ist nicht in `.env.local` gesetzt.

**Abhilfe:**
```bash
# Prüfen
grep DATABASE_URL /opt/velora/velora-casino-demo/.env.local

# Falls nicht vorhanden: hinzufügen
echo "DATABASE_URL=postgresql://velora:velora@localhost:5432/velora" \
  >> /opt/velora/velora-casino-demo/.env.local

# Service neu starten
sudo systemctl restart velora
```

---

### „BETTER_AUTH_URL muss in Produktion mit https:// beginnen"

**Ursache:** `NODE_ENV=production` ist gesetzt, `BETTER_AUTH_URL` beginnt aber mit `http://`.

**Abhilfe:**

In `.env.local`:
```
BETTER_AUTH_URL=https://velora.example.com
```

Statt:
```
BETTER_AUTH_URL=http://velora.example.com
```

Service neu starten.

---

### Fehler „getaddrinfo ENOTFOUND localhost:5432" (oder andere Host)

**Ursache:** PostgreSQL läuft nicht oder ist nicht erreichbar.

**Abhilfe (nativ):**

```bash
sudo systemctl status postgresql
sudo systemctl restart postgresql

# Verbindung prüfen
psql -U velora -d velora -h localhost -c "SELECT 1;"
```

**Abhilfe (Docker):**

```bash
docker compose ps
docker compose logs postgres

# Ggf. neu starten
docker compose down
docker compose up -d
```

---

### Anmeldung schlägt fehl: "Invalid request" oder OAuth-Fehler

**Mögliche Ursachen:**

1. **BETTER_AUTH_URL passt nicht zur aufgerufenen URL**

   Beispiel: `BETTER_AUTH_URL=https://app.example.com`, aber Benutzer ruft `https://velora.example.com` auf.

   **Abhilfe:** Stelle sicher, dass `BETTER_AUTH_URL` exakt die öffentliche Adresse ist, unter der die App erreichbar ist.

2. **OAuth-Callback-URL falsch**

   Beispiel: `BETTER_AUTH_URL=https://velora.example.com`, aber in Google Console ist `https://app.example.com/api/auth/callback/google` eingetragen.

   **Abhilfe:** Callback-URLs bei allen OAuth-Providern überprüfen und korrigieren.

3. **SESSION_SECRET oder BETTER_AUTH_SECRET fehlt/ungültig**

   **Abhilfe:**
   ```bash
   # BETTER_AUTH_SECRET prüfen (mindestens 32 Zeichen)
   grep BETTER_AUTH_SECRET /opt/velora/velora-casino-demo/.env.local
   ```

---

### Admin-Zugang funktioniert nicht

**Ursache:** Benutzer wurde nicht als Admin eingetragen.

**Abhilfe:**

1. Benutzer-E-Mail notieren
2. `ADMIN_BOOTSTRAP_EMAIL=<email>` in `.env.local` setzen
3. `npm run db:seed` aufrufen

   ```bash
   cd /opt/velora/velora-casino-demo
   sudo -u velora npm run db:seed
   ```

4. Prüfen:

   ```bash
   psql -U velora -d velora -c "SELECT id, email, role FROM \"user\" WHERE email = '<email>';"
   ```

5. Falls Ausgabe immer noch `NULL` oder `user` unter `role`: Benutzer existiert nicht in der Datenbank oder wurde nicht seedet
   - In diesem Fall: Benutzer manuell registrieren (via `/register`), dann erneut seeden

---

### Migrationen schlagen fehl: "column … does not exist"

**Ursache:** Migrationen wurden nicht vollständig ausgeführt.

**Abhilfe:**

```bash
cd /opt/velora/velora-casino-demo

# Migrations-Status prüfen
sudo -u velora npm run db:migrate

# Bei Fehler: Datenbank zurücksetzen (VORSICHT: alle Daten werden gelöscht!)
psql -U velora -d velora -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Dann erneut
sudo -u velora npm run db:migrate
sudo -u velora npm run db:seed
```

---

### Kein Speicherplatz verfügbar

**Auf dem Datenbank-Volume prüfen:**

```bash
# Docker
docker exec velora-postgres du -h /var/lib/postgresql/data

# Nativ
sudo du -h /var/lib/postgresql/17/main
```

**Backup-Strategie:** Regelmäßige Backups auf ein externes Speichermedium sichern und lokale Backups löschen.

---

## Sicherheitshinweise

### Geheimnisse

- **BETTER_AUTH_SECRET:** Pro Umgebung unterschiedlich, nie einchecken, min. 32 Zeichen
- **Datenbankpasswort:** Nicht in `.env.local` hartcodieren; verwende stattdessen `EnvironmentFile` in systemd (siehe oben)
- **OAuth-Secrets:** Nie öffentlich preisgeben

### Datenschutz

- `.env.local`-Dateirechte auf 600 (nur Besitzer lesbar): `sudo chmod 600 .env.local`
- Datenbank nicht öffentlich erreichbar (Firewall, kein `listen_addresses = '*'`)
- Regelmäßige Backups mit Verschlüsselung

### Service-Sicherheit

- Anwendung läuft **nicht als root** (systemd-Service: `User=velora`)
- Reverse Proxy auf **https://** mit Let's Encrypt
- TLS 1.2+ erzwungen (nginx-Config oben: `ssl_protocols TLSv1.2 TLSv1.3`)
- Session-Cookies sind `Secure` (nur über HTTPS) und `HttpOnly` (nicht von JS aus erreichbar) — besser-auth setzt das automatisch, wenn `BETTER_AUTH_URL` mit `https://` beginnt

### Aktualisierungen

```bash
# Regelmäßig npm-Abhängigkeiten aktualisieren
cd /opt/velora/velora-casino-demo
npm update

# OS-Sicherheitsupdates
sudo apt update && sudo apt upgrade -y
```

**Nicht verwenden:** `npm audit fix --force` — siehe Warnung im Abschnitt „Abhängigkeiten
installieren" oben. Stattdessen `npm audit --omit=dev` zur Bewertung nutzen und betroffene Pakete
einzeln, gezielt aktualisieren.

### Zertifikatserneuerung

Let's Encrypt-Zertifikate laufen nach 90 Tagen ab. Certbot erneuert automatisch:

```bash
# Automatische Erneuerung prüfen
sudo systemctl status certbot.timer
sudo systemctl enable certbot.timer

# Manuell testen
sudo certbot renew --dry-run
```

---

### Bekannte Einschränkungen

Die Anwendung hat folgende bewusste Einschränkungen, **ohne**:

- **E-Mail-Versand**: Kein Passwort-Reset über die Oberfläche; Passwörter können nur direkt in der Datenbank zurückgesetzt werden
- **Strukturiertes Logging**: Logs gehen ins systemd-Journal; kein zentrales Logging (ELK, Loki)
- **Automatische Sicherung**: Keine integrierten Backup-Cronjobs; manuelle Verwaltung nötig (siehe Abschnitt Betrieb)
- **Security Headers**: Keine CSP, HSTS oder anderen HTTP-Security-Header im Code; diese sollten vom Reverse Proxy gesetzt werden
- **Altersprüfung / KYC**: Keine Identitätsprüfung
- **Echte Zahlungen**: Nur Credits als Spielwährung ohne Geldwert, keine Echtgeld-Transaktionen oder Auszahlungen

---

## Einordnung: Was ist velora-casino-demo?

**velora-casino-demo** ist eine vollständige Fullstack-Anwendung mit:
- Benutzerauthentifizierung und Autorisierung (better-auth, PostgreSQL)
- Datenbankpersistierung und serverseitigem Spiel-State
- Spieloberflächen und Spiel-Engines mit Spielwährung (Credits) — Spielen erfordert ein Konto, jede Kontoanlage erhält 10.000 Credits Startguthaben
- Responsible-Gaming-Features (Session-Timer, Limits, Selbstsperre)

**Es ist nicht:**
- Eine echte Casino-Plattform mit Echtgeld
- Mit echtem Geld verbunden — Credits sind eine Spielwährung ohne Geldwert, ohne Ein- oder Auszahlungsweg
- Lizenziert (keine Glücksspiel-Lizenz)
- Für den Betrieb mit echten Einsätzen bestimmt

Wenn die Instanz öffentlich zugänglich ist, muss das transparent gemacht werden: "Diese Anwendung verwendet ausschließlich Credits als Spielwährung ohne Geldwert, kein Echtgeld, keine Glücksspiel-Lizenz."

---

## Weitere Ressourcen

- `README.md` — Schnellstart für Entwicklung, technische Entscheidungen
- `CLAUDE.md` — Projektrichtlinien und Architektur
- `.env.example` — Vorlage aller Umgebungsvariablen mit Kommentaren
- `docker-compose.yml` — Lokale PostgreSQL-Konfiguration
- `drizzle.config.ts` — Datenbank-Migrations-Konfiguration
- `lib/env.ts` — Validierungsregeln für Umgebungsvariablen
- `server/auth/rate-limit.ts`, `server/auth/rate-limit-plugin.ts` — Login-Rate-Limiting
- `scripts/backup-db.sh`, `scripts/restore-db.sh` — Datenbank-Backup und -Wiederherstellung (siehe Abschnitt „Datenbankwartung" oben)
- `.github/workflows/ci.yml` — CI-Pipeline (Lint, Typprüfung, Tests, Build, Nebenläufigkeitsnachweis)

---

Letzte Aktualisierung: 2026-08-19
