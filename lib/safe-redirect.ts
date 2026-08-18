/**
 * Prüft ein `next`-Ziel (Query-Parameter nach Anmeldung, Middleware-Redirect) auf Sicherheit
 * vor einer offenen Weiterleitung. Nur relative, projektinterne Pfade sind erlaubt — niemals
 * eine externe URL, egal wie sie kodiert ist.
 *
 * Warum der WHATWG-URL-Parser statt reiner String-Prüfungen (`startsWith("/")`): Der Parser
 * bildet dieselben Normalisierungen ab, die Browser beim tatsächlichen Navigieren anwenden
 * (z. B. Backslash → Slash bei "special" Schemes wie http/https, Entfernen von eingebetteten
 * Tab-/Zeilenumbruch-Zeichen). Eine naive Präfixprüfung würde genau diese Normalisierungen
 * NICHT nachvollziehen und ließe sich z. B. mit `/\evil.example` umgehen: die Zeichenkette
 * beginnt mit einem Schrägstrich, wird von Browsern aber zu `//evil.example` normalisiert und
 * damit protokollrelativ zu einer fremden Origin. Der Vergleich der aufgelösten Origin gegen
 * eine feste, erfundene Basis-Origin deckt diese und ähnliche Varianten einheitlich ab, statt
 * jede Umgehung einzeln als Sonderfall abfangen zu müssen.
 */

const DEFAULT_FALLBACK = "/profile";

/** Erfundene, nie auflösbare Basis-Origin — dient nur als Referenzpunkt für den Origin-Vergleich. */
const INTERNAL_BASE = "http://internal.invalid";

export function safeNext(next: string | null | undefined, fallback: string = DEFAULT_FALLBACK): string {
  if (!next) return fallback;

  // Muss mit GENAU einem Schrägstrich beginnen: kein Schema (http:, javascript:), kein
  // protokollrelativer Doppel-Schrägstrich (//evil.example).
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;

  // Pfad-Traversal wird unabhängig vom Origin-Ergebnis abgewiesen (Auftrag §1) — auch wenn ein
  // "/.."-Segment die Origin nie verlassen kann, ist es kein gültiges, vorhersehbares Ziel.
  if (next.includes("..")) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(next, INTERNAL_BASE);
  } catch {
    return fallback;
  }

  // Nach der Normalisierung durch den URL-Parser muss die Origin unverändert die erfundene
  // Basis sein — jede Abweichung (Backslash-Trick, eingebettete Steuerzeichen, ein eigenes
  // Schema) hätte sie verändert.
  if (resolved.origin !== INTERNAL_BASE) return fallback;

  const target = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}
