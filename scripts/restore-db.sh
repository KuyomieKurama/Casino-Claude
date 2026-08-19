#!/usr/bin/env bash
#
# Stellt ein PostgreSQL-Backup (pg_dump -Fc, siehe scripts/backup-db.sh) in die Datenbank aus
# DATABASE_URL wieder her. Das Passwort aus der Verbindungs-URL wird vor dem Aufruf entfernt und
# stattdessen über die Umgebungsvariable PGPASSWORD gereicht (siehe extract_database_password()
# und database_url_without_password() unten) — sonst stünde das Passwort als Kommandozeilenargument
# in /proc/<pid>/cmdline, das auf Standard-Linux für alle lokalen Nutzer lesbar ist.
#
# DESTRUKTIVE OPERATION: pg_restore läuft mit --clean --if-exists, löscht also bestehende
# Objekte in der Zieldatenbank, bevor der Dump-Inhalt eingespielt wird. Deshalb fragt dieses
# Skript standardmäßig interaktiv nach, bevor irgendetwas verändert wird — Ziel-Datenbank und
# Dump-Datei stehen sichtbar in der Rückfrage.
#
# Verwendung:
#   scripts/restore-db.sh <dump-datei> [--force]
#
# --force überspringt die interaktive Rückfrage (z. B. für ein automatisiertes
# Wiederherstellungstest-Skript) — niemals als Standardweg in einem interaktiven Terminal
# verwenden.
#
# Quelle von DATABASE_URL: bereits gesetzte Umgebungsvariable, sonst .env bzw. .env.local im
# Projektwurzelverzeichnis (dieselbe Rangfolge wie bei `npm run db:migrate`). Die Dateien werden
# über Node gelesen (`--env-file-if-exists`, dieselbe Option wie in package.json bei
# db:migrate/db:seed) — ein reiner Schlüssel-Wert-Parser ohne Shell-Interpretation. Bewusst kein
# `source .env` mehr: Das würde jede in der Datei enthaltene Shell-Syntax ausführen (z. B.
# Command-Substitution in einem Wert).
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_ROOT

mask_database_url() {
  printf '%s' "$1" | sed -E 's#(://[^:/@]+:)[^@]*(@)#\1***\2#'
}

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

# Liefert DATABASE_URL ohne das Passwort-Segment. Diese Variante geht als --dbname an pg_restore,
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

print_usage() {
  echo "Verwendung: $(basename "${BASH_SOURCE[0]}") <dump-datei> [--force]" >&2
}

DUMP_FILE=""
FORCE=0
for arg in "$@"; do
  case "${arg}" in
    --force)
      FORCE=1
      ;;
    -h | --help)
      print_usage
      exit 0
      ;;
    *)
      if [ -n "${DUMP_FILE}" ]; then
        echo "Fehler: Nur eine Dump-Datei kann angegeben werden." >&2
        print_usage
        exit 1
      fi
      DUMP_FILE="${arg}"
      ;;
  esac
done

require_command pg_restore
require_command node
load_database_url_from_env_files

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Fehler: DATABASE_URL ist nicht gesetzt." >&2
  echo "Was tun: DATABASE_URL in der Umgebung exportieren oder in .env/.env.local eintragen (siehe .env.example)." >&2
  exit 1
fi

if [ -z "${DUMP_FILE}" ]; then
  echo "Fehler: Keine Dump-Datei angegeben." >&2
  print_usage
  exit 1
fi

if [ ! -f "${DUMP_FILE}" ]; then
  echo "Fehler: Dump-Datei '${DUMP_FILE}' existiert nicht." >&2
  echo "Was tun: Pfad prüfen, z. B. mit 'ls backups/'." >&2
  exit 1
fi

MASKED_URL="$(mask_database_url "${DATABASE_URL}")"

echo "ACHTUNG: Diese Operation überschreibt bestehende Daten in der Zieldatenbank."
echo "Zieldatenbank: ${MASKED_URL}"
echo "Dump-Datei: ${DUMP_FILE}"

if [ "${FORCE}" -ne 1 ]; then
  CONFIRMATION=""
  read -r -p "Zum Bestätigen 'ja' eingeben, alles andere bricht ab: " CONFIRMATION || CONFIRMATION=""
  if [ "${CONFIRMATION}" != "ja" ]; then
    echo "Abgebrochen: Keine Bestätigung erhalten, keine Änderung vorgenommen." >&2
    exit 1
  fi
fi

echo "Wiederherstellung wird ausgeführt."

DB_PASSWORD="$(extract_database_password)"
DB_URL_NO_PASSWORD="$(database_url_without_password)"

if [ -n "${DB_PASSWORD}" ]; then
  PGPASSWORD="${DB_PASSWORD}" pg_restore --dbname="${DB_URL_NO_PASSWORD}" --clean --if-exists --no-owner --no-privileges "${DUMP_FILE}"
else
  pg_restore --dbname="${DB_URL_NO_PASSWORD}" --clean --if-exists --no-owner --no-privileges "${DUMP_FILE}"
fi

echo "Wiederherstellung abgeschlossen: ${DUMP_FILE} → ${MASKED_URL}."
