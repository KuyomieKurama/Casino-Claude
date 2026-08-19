#!/usr/bin/env bash
#
# Erstellt ein PostgreSQL-Backup im Custom-Format (pg_dump -Fc) aus der Verbindung, die über
# DATABASE_URL beschrieben ist. Das Passwort aus der Verbindungs-URL wird vor dem Aufruf entfernt
# und stattdessen über die Umgebungsvariable PGPASSWORD gereicht (siehe extract_database_password()
# und database_url_without_password() unten) — sonst stünde das Passwort als Kommandozeilenargument
# in /proc/<pid>/cmdline, das auf Standard-Linux für alle lokalen Nutzer lesbar ist.
# mask_database_url() erzeugt zusätzlich eine Kopie mit maskiertem Passwort, ausschließlich für
# die Bildschirmausgabe.
#
# Quelle von DATABASE_URL: bereits gesetzte Umgebungsvariable, sonst .env bzw. .env.local im
# Projektwurzelverzeichnis (dieselbe Rangfolge wie bei `npm run db:migrate`: .env.local
# überschreibt .env, eine bereits gesetzte Umgebungsvariable wird nie überschrieben). Die Dateien
# werden über Node gelesen (`--env-file-if-exists`, dieselbe Option wie in package.json bei
# db:migrate/db:seed) — ein reiner Schlüssel-Wert-Parser ohne Shell-Interpretation. Bewusst kein
# `source .env` mehr: Das würde jede in der Datei enthaltene Shell-Syntax ausführen (z. B.
# Command-Substitution in einem Wert).
#
# Verwendung:
#   scripts/backup-db.sh [zielverzeichnis]
#
# Beispiele:
#   scripts/backup-db.sh
#   scripts/backup-db.sh /var/backups/velora
#
# Aufbewahrung (optional): Ist BACKUP_RETENTION_DAYS gesetzt, werden ältere Backups im
# Zielverzeichnis nach dem Lauf gelöscht.
#
# Dateirechte: Der Dump enthält Klartext-Sitzungstoken und OAuth-Zugangstoken aus
# server/db/auth-schema.ts (session.token, account.accessToken/refreshToken/idToken) — wer die
# Datei lesen kann, kann damit fremde Sitzungen unmittelbar übernehmen. Deshalb setzt dieses
# Skript `umask 077`, bevor irgendetwas geschrieben wird: Verzeichnis und Datei entstehen dadurch
# direkt mit 700 bzw. 600, ohne ein Zeitfenster, in dem sie mit den Standardrechten (üblicherweise
# 755/644 bei umask 022) für alle lokalen Nutzer lesbar wären. Ein nachträgliches chmod hätte
# genau dieses Zeitfenster zwischen Erzeugung und Rechtevergabe — deshalb umask, nicht chmod.
#
# Empfehlung: Vor jeder Migration in Produktion (`npm run db:migrate`) ein Backup erzeugen.
set -euo pipefail
umask 077

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_ROOT
readonly DEFAULT_BACKUP_DIR="${PROJECT_ROOT}/backups"

# Maskiert das Passwort in einer postgres(ql)://user:passwort@host:port/db-Verbindung für
# Log-Ausgaben. Ohne Passwort im String (z. B. postgres://user@host/db) bleibt der Wert
# unverändert, weil das Muster dann nicht greift — es wird nirgends ein Geheimnis ausgegeben.
mask_database_url() {
  printf '%s' "$1" | sed -E 's#(://[^:/@]+:)[^@]*(@)#\1***\2#'
}

# Übernimmt DATABASE_URL aus .env/.env.local nur, wenn sie nicht bereits in der Prozessumgebung
# gesetzt ist (z. B. von systemd EnvironmentFile= oder einem vorgeschalteten export). Liest die
# Dateien über Nodes --env-file-if-exists ein (reiner Schlüssel-Wert-Parser, keine
# Shell-Ausführung) statt sie mit `source` einzulesen.
load_database_url_from_env_files() {
  if [ -n "${DATABASE_URL:-}" ]; then
    return 0
  fi
  DATABASE_URL="$(node \
    --env-file-if-exists="${PROJECT_ROOT}/.env" \
    --env-file-if-exists="${PROJECT_ROOT}/.env.local" \
    -e 'process.stdout.write(process.env.DATABASE_URL ?? "")')"
  export DATABASE_URL
}

# Liefert das (dekodierte) Passwort aus DATABASE_URL, leer wenn keins gesetzt ist. Die URL wird
# ausschließlich über process.env gelesen, nie als Node-Argument oder in den -e-Skriptquelltext
# eingebettet — sonst stünde sie in der Prozessliste. Parsing-Fehler werden abgefangen: eine
# ungefangene Exception von `new URL()` gibt die ungültige Eingabe (inkl. Passwort) über
# node:internal/url auf stderr aus, das darf hier nicht passieren.
extract_database_password() {
  DATABASE_URL="${DATABASE_URL}" node -e '
    try {
      const url = new URL(process.env.DATABASE_URL);
      process.stdout.write(decodeURIComponent(url.password));
    } catch {
      process.exit(1);
    }
  ' || {
    echo "Fehler: DATABASE_URL ist keine gültige Verbindungs-URL." >&2
    echo "Was tun: Format prüfen, z. B. postgresql://user:passwort@host:5432/db." >&2
    exit 1
  }
}

# Liefert DATABASE_URL ohne das Passwort-Segment. Diese Variante geht als --dbname an pg_dump,
# das Passwort selbst wird separat über PGPASSWORD gereicht (siehe unten).
database_url_without_password() {
  DATABASE_URL="${DATABASE_URL}" node -e '
    try {
      const url = new URL(process.env.DATABASE_URL);
      url.password = "";
      process.stdout.write(url.toString());
    } catch {
      process.exit(1);
    }
  ' || {
    echo "Fehler: DATABASE_URL ist keine gültige Verbindungs-URL." >&2
    exit 1
  }
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Fehler: '${cmd}' ist nicht installiert oder nicht im PATH." >&2
    echo "Was tun: PostgreSQL-Client-Werkzeuge installieren (z. B. 'apt install postgresql-client')." >&2
    exit 1
  fi
}

require_command pg_dump
require_command node
load_database_url_from_env_files

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Fehler: DATABASE_URL ist nicht gesetzt." >&2
  echo "Was tun: DATABASE_URL in der Umgebung exportieren oder in .env/.env.local eintragen (siehe .env.example)." >&2
  exit 1
fi

BACKUP_DIR="${1:-${DEFAULT_BACKUP_DIR}}"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly TIMESTAMP
BACKUP_FILE="${BACKUP_DIR}/velora_${TIMESTAMP}.dump"

echo "Backup wird erstellt."
echo "Verbindung: $(mask_database_url "${DATABASE_URL}")"
echo "Ziel: ${BACKUP_FILE}"

DB_PASSWORD="$(extract_database_password)"
DB_URL_NO_PASSWORD="$(database_url_without_password)"

if [ -n "${DB_PASSWORD}" ]; then
  PGPASSWORD="${DB_PASSWORD}" pg_dump --dbname="${DB_URL_NO_PASSWORD}" --format=custom --file="${BACKUP_FILE}"
else
  pg_dump --dbname="${DB_URL_NO_PASSWORD}" --format=custom --file="${BACKUP_FILE}"
fi

echo "Backup abgeschlossen: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))."

if [ -n "${BACKUP_RETENTION_DAYS:-}" ]; then
  echo "Aufbewahrung: Lösche Backups älter als ${BACKUP_RETENTION_DAYS} Tag(e) in ${BACKUP_DIR}."
  find "${BACKUP_DIR}" -maxdepth 1 -name 'velora_*.dump' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete
fi
