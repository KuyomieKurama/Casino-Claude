import { SCHEMA_VERSION, STORAGE_KEY } from "@/lib/constants";

/**
 * Einzige Stelle, an der LocalStorage angefasst wird (Schichtregel, ESLint erzwingt das).
 * Ein Schlüssel `velora.demo.v1`, Inhalt mit schemaVersion. Alle Zugriffe in try/catch.
 * Behandelt: fehlender Schlüssel, defektes JSON, unbekannte Version, blockiertes Storage.
 */

// "rg" entfiel mit SCHEMA_VERSION 4 (lib/constants.ts) — Responsible Gaming lebt seither
// ausschließlich in der Datenbank, siehe dortiger Versionskommentar.
//
// "soundPrefs" (Auftrag „Klang-Infrastruktur") kam OHNE SCHEMA_VERSION-Anhebung hinzu: eine neue,
// unabhängige Scheibe ist rein additiv (siehe Begründung in lib/constants.ts bei SCHEMA_VERSION).
export type SliceKey = "wallet" | "catalogPrefs" | "soundPrefs";

export type PersistedSlices = Partial<Record<SliceKey, unknown>>;

export type PersistedEnvelope = { schemaVersion: number } & PersistedSlices;

export type StorageStatus =
  | "ok" // gelesen und verwendet
  | "empty" // Erstbesuch, keine Daten
  | "corrupt" // JSON defekt → verworfen
  | "unsupported-version" // fremde schemaVersion → verworfen statt raten
  | "unavailable"; // Storage blockiert/voll → In-Memory-Fallback

export type LoadResult = { status: StorageStatus; slices: PersistedSlices };

const WRITE_THROTTLE_MS = 250;

let storageRef: Storage | null | undefined; // undefined = noch nicht geprüft
let memoryFallback: string | null = null;
let cache: PersistedSlices = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function probeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const s = window.localStorage;
    const probe = `${STORAGE_KEY}.probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  if (storageRef === undefined) storageRef = probeStorage();
  return storageRef;
}

/** true, wenn Daten den Reload überleben; false im In-Memory-Fallback. */
export function isPersistent(): boolean {
  return storage() !== null;
}

function readRaw(): string | null {
  const s = storage();
  if (!s) return memoryFallback;
  try {
    return s.getItem(STORAGE_KEY);
  } catch {
    return memoryFallback;
  }
}

function writeRaw(value: string): boolean {
  const s = storage();
  if (!s) {
    memoryFallback = value;
    return false;
  }
  try {
    s.setItem(STORAGE_KEY, value);
    return true;
  } catch {
    // Quota erschöpft oder nachträglich blockiert → ab jetzt In-Memory.
    storageRef = null;
    memoryFallback = value;
    return false;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Liest den Envelope, validiert Version und Form. Nie werfend. */
export function loadPersisted(): LoadResult {
  const raw = readRaw();
  const unavailable = !isPersistent();
  if (raw === null) {
    cache = {};
    return { status: unavailable ? "unavailable" : "empty", slices: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    cache = {};
    return { status: "corrupt", slices: {} };
  }
  if (!isRecord(parsed) || typeof parsed.schemaVersion !== "number") {
    cache = {};
    return { status: "corrupt", slices: {} };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    cache = {};
    return { status: "unsupported-version", slices: {} };
  }
  const slices: PersistedSlices = {};
  for (const key of ["wallet", "catalogPrefs", "soundPrefs"] as const) {
    if (key in parsed && parsed[key] !== undefined) slices[key] = parsed[key];
  }
  cache = { ...slices };
  return { status: unavailable ? "unavailable" : "ok", slices };
}

/**
 * Einmalige Rückwärtskompatibilitäts-Prüfung (SCHEMA_VERSION 4, siehe lib/constants.ts): eine VOR
 * der serverseitigen Umstellung lokal gesetzte Selbstsperre ("rg.selfExcluded": true in einer
 * älteren Envelope-Version) darf beim Umstieg nicht stillschweigend verloren gehen — sonst wäre
 * ein zuvor gesperrter Nutzer nach dem Update unbemerkt wieder spielberechtigt. `loadPersisted()`
 * verwirft eine fremde `schemaVersion` bewusst vollständig ("unsupported-version"); dieser
 * Lesezugriff umgeht das GEZIELT, nur um diese eine sicherheitsrelevante Eigenschaft zu prüfen —
 * state/RgContext.tsx überträgt einen gefundenen Treffer einmalig auf den Server
 * (POST /api/rg/self-exclusion), statt ihn nur anzuzeigen. Nie werfend, nie schreibend.
 */
export function readLegacySelfExclusionFlag(): boolean {
  const s = storage();
  if (!s) return false;
  let raw: string | null;
  try {
    raw = s.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return false;
    const rg = parsed.rg;
    return isRecord(rg) && rg.selfExcluded === true;
  } catch {
    return false;
  }
}

function bindFlushListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
}

/** Schreibt sofort. Wird gedrosselt über writeSlice aufgerufen, direkt bei pagehide. */
export function flushNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const envelope: PersistedEnvelope = { schemaVersion: SCHEMA_VERSION, ...cache };
  try {
    writeRaw(JSON.stringify(envelope));
  } catch {
    // JSON.stringify kann nur bei zyklischen Strukturen werfen — die gibt es hier nicht.
  }
}

/** Aktualisiert eine Domänen-Scheibe im Cache und plant einen gedrosselten Schreibvorgang. */
export function writeSlice(key: SliceKey, value: unknown): void {
  cache = { ...cache, [key]: value };
  bindFlushListeners();
  if (flushTimer) return;
  flushTimer = setTimeout(flushNow, WRITE_THROTTLE_MS);
}

/** Entfernt alle persistierten lokalen Daten (Logout „alles löschen“, Tests). */
export function clearPersisted(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  cache = {};
  memoryFallback = null;
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    // ignorieren — Storage nicht schreibbar
  }
}

/** Nur für Tests: setzt den internen Zustand zurück, damit die Storage-Erkennung erneut läuft. */
export function __resetStorageForTests(): void {
  storageRef = undefined;
  memoryFallback = null;
  cache = {};
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
