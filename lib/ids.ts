/** IDs für Nutzer und Runden. Kein Bezug zu Spiellogik-Zufall (dafür lib/rng.ts). */
export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
