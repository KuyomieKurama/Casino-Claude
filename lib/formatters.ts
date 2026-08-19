import type { CreditsMinor } from "@/types/money";

/**
 * Formatiert ganzzahlige Hundertstel als deutsche Dezimalzahl: 105000 → "1.050,00".
 * Bewusst ohne Intl, damit Node, jsdom und Browser identisch formatieren.
 */
export function formatCredits(minor: CreditsMinor): string {
  if (!Number.isFinite(minor)) return "–";
  const rounded = Math.trunc(minor);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centsStr = cents.toString().padStart(2, "0");
  return `${negative ? "−" : ""}${wholeStr},${centsStr}`;
}

/** Wie formatCredits, aber mit explizitem Vorzeichen für Bewegungen: +12,50 / −0,60 / ±0,00 */
export function formatCreditsSigned(minor: CreditsMinor): string {
  if (minor > 0) return `+${formatCredits(minor)}`;
  if (minor < 0) return formatCredits(minor);
  return `±${formatCredits(0)}`;
}

/** Mit Einheit — für alle Stellen mit Geldbezug. */
export function formatCreditsWithUnit(minor: CreditsMinor): string {
  return `${formatCredits(minor)} Credits`;
}

/** Zahl aus einer Nutzereingabe wie "1,50" oder "1.5" in Hundertstel; null bei ungültiger Eingabe. */
export function parseCreditsInput(input: string): CreditsMinor | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [wholePart, fracPart = ""] = cleaned.split(".");
  const whole = Number.parseInt(wholePart ?? "0", 10);
  const frac = Number.parseInt(fracPart.padEnd(2, "0"), 10);
  return whole * 100 + frac;
}

/** 0.95 → "95,0 %" */
export function formatPercent(fraction: number, decimals = 1): string {
  const value = (fraction * 100).toFixed(decimals).replace(".", ",");
  return `${value} %`;
}

export function formatMultiplier(multiplier: number): string {
  const str = Number.isInteger(multiplier) ? multiplier.toString() : multiplier.toString().replace(".", ",");
  return `${str}×`;
}

/** Dauer in Minuten/Stunden für den Session-Timer: 3.600.000 → "1 Std. 0 Min." */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} Min.`;
  return `${hours} Std. ${minutes} Min.`;
}

export function formatDurationClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const pad2 = (n: number) => n.toString().padStart(2, "0");

/** ISO-Zeitstempel → "15.08.2026, 10:42" (lokale Zeit) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
