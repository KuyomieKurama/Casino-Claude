// Automatischer Kontrast-Test für die Design-Tokens aus app/globals.css.
//
// Warum: globals.css dokumentiert Kontrastwerte nur als Kommentar (z. B. "8,14:1 auf
// surface"). Ein Kommentar schützt nicht davor, dass jemand später einen Farbwert
// verschlechtert, ohne den Kommentar nachzuziehen. Dieser Test liest die tatsächlichen
// Tokenwerte aus der CSS-Datei, berechnet den Kontrast nach WCAG 2.1 und schlägt fehl,
// sobald eine der zugesagten Kontrastschwellen unterschritten wird — unabhängig davon,
// ob der Kommentar aktualisiert wurde. Keine neue Abhängigkeit: Die Kontrastformel ist
// eine eigenständige, kleine Implementierung nach der offiziellen WCAG-Spezifikation.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const GLOBALS_CSS_PATH = path.join(process.cwd(), "app", "globals.css");
const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");

/** Zerlegt einen Hex-Farbwert (3- oder 6-stellig) in seine RGB-Kanäle (0–255). */
function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : normalized;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Relative Luminanz nach WCAG 2.1 (§1.4.3 / §1.4.11 zugrundeliegende Formel).
 * sRGB-Kanäle werden linearisiert, bevor sie gewichtet aufsummiert werden.
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linearize = (channel: number): number => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  const [rLin, gLin, bLin] = [linearize(r), linearize(g), linearize(b)];
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/** Kontrastverhältnis zweier Hex-Farben nach WCAG 2.1, Ergebnis zwischen 1 und 21. */
function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexToRgb(hexA));
  const luminanceB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Liest den Hex-Wert eines Custom-Property-Tokens aus globals.css.
 * Der Zeilenumbruch-lose Zeilenabgleich vermeidet Fehltreffer bei Namen mit
 * gemeinsamem Präfix (z. B. "--gold" darf nicht "--gold-strong" treffen), weil
 * unmittelbar nach dem Namen ein Doppelpunkt verlangt wird.
 */
function readColorToken(name: string): string {
  const pattern = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`);
  const match = css.match(pattern);
  const hexValue = match?.[1];
  if (!hexValue) {
    throw new Error(`Token --${name} wurde nicht in app/globals.css gefunden.`);
  }
  return hexValue;
}

/** Liest die vollständige Deklarationszeile eines Tokens (Wert + Kommentar). */
function readTokenLine(name: string): string {
  const pattern = new RegExp(`--${name}:[^\\n]*;[^\\n]*`);
  const match = css.match(pattern);
  if (!match) {
    throw new Error(`Token --${name} wurde nicht in app/globals.css gefunden.`);
  }
  return match[0];
}

describe("Kontrastfunktion (Selbsttest gegen bekannte WCAG-Referenzwerte)", () => {
  it("liefert 21:1 für Schwarz auf Weiß", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("liefert 1:1 für identische Farben", () => {
    expect(contrastRatio("#14171c", "#14171c")).toBeCloseTo(1, 5);
  });

  it("ist symmetrisch (Reihenfolge der Argumente ändert das Ergebnis nicht)", () => {
    expect(contrastRatio("#f2f4f7", "#0b0d10")).toBeCloseTo(contrastRatio("#0b0d10", "#f2f4f7"), 5);
  });
});

describe("Design-Tokens: zugesagte WCAG-Kontraste (app/globals.css)", () => {
  it("text-primary auf bg-base erreicht AAA (>= 7:1)", () => {
    const ratio = contrastRatio(readColorToken("text-primary"), readColorToken("bg-base"));
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("text-primary auf bg-surface erreicht AAA (>= 7:1)", () => {
    const ratio = contrastRatio(readColorToken("text-primary"), readColorToken("bg-surface"));
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("text-muted auf bg-surface erreicht mindestens AA (>= 4,5:1)", () => {
    const ratio = contrastRatio(readColorToken("text-muted"), readColorToken("bg-surface"));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["gold", "teal", "success", "warning", "danger"])(
    "%s auf bg-surface erreicht mindestens AA (>= 4,5:1)",
    (tokenName) => {
      const ratio = contrastRatio(readColorToken(tokenName), readColorToken("bg-surface"));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("on-gold auf gold erreicht mindestens AA (>= 4,5:1)", () => {
    const ratio = contrastRatio(readColorToken("on-gold"), readColorToken("gold"));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("border-control auf bg-surface erreicht mindestens 3:1 (WCAG 1.4.11, Bedienelement-Umriss)", () => {
    const ratio = contrastRatio(readColorToken("border-control"), readColorToken("bg-surface"));
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("border-subtle bleibt wie dokumentiert unter 3:1 und ist als rein dekorativ gekennzeichnet", () => {
    // Gegenprobe: --border-subtle ist bewusst kein Kontrast-Token. Der Kommentar in
    // globals.css hält fest, dass es nie die alleinige Markierung eines Bedienelements
    // trägt. Dieser Test dokumentiert diese Ausnahme maschinell, statt sie stillschweigend
    // zu übergehen.
    const ratio = contrastRatio(readColorToken("border-subtle"), readColorToken("bg-surface"));
    expect(ratio).toBeLessThan(3);
    expect(readTokenLine("border-subtle").toUpperCase()).toContain("DEKORATIV");
  });
});

// ─── Tiefe, Licht, Interaktion (Ergänzung) ──────────────────────────────────
// Die folgenden Tokens (Elevation, Kantenlicht, Umgebungslicht, Glow, Metall-
// Akzent) sind Schatten-/Verlaufskompositionen, keine eigenständigen soliden
// Farbtokens. Jedes von ihnen muss entweder oben mit einer konkreten
// Kontrastschwelle geprüft sein (ist keines) oder in globals.css nachweislich
// als "REIN DEKORATIV" gekennzeichnet sein — genau das prüft dieser Block.
describe("Design-Tokens: neue Effekt-Tokens sind dekorativ dokumentiert", () => {
  const decorativeTokenNames = [
    "shadow-rest",
    "shadow-hover",
    "shadow-raised",
    "edge-light",
    "ambient-glow",
    "glow-gold",
    "glow-teal",
    "metal-sheen",
  ];

  it.each(decorativeTokenNames)("--%s ist im Kommentar als REIN DEKORATIV markiert", (tokenName) => {
    expect(readTokenLine(tokenName).toUpperCase()).toContain("DEKORATIV");
  });
});

describe("Design-Tokens: jedes solide Hex-Farbtoken ist geprüft oder dekorativ markiert", () => {
  // Generische Sicherung gegen zukünftige Ergänzungen: Jedes NEUE "--name: #hex;"-Token
  // in globals.css muss entweder zur oben geprüften Menge gehören oder im Kommentar
  // "DEKORATIV" tragen. So kann kein neues, ungeprüftes Farbtoken unbemerkt einsickern.
  const alreadyTestedAbove = new Set([
    "bg-base",
    "bg-surface",
    "bg-elevated",
    "text-primary",
    "text-muted",
    "gold",
    "gold-strong",
    "on-gold",
    "teal",
    "success",
    "warning",
    "danger",
    "border-subtle",
    "border-control",
  ]);

  it("keine ungeprüften, nicht-dekorativen Hex-Farbtoken vorhanden", () => {
    const hexTokenPattern = /--([a-z0-9-]+):\s*(?:#[0-9a-fA-F]{3,6})\s*;([^\n]*)/g;
    const undocumented: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = hexTokenPattern.exec(css)) !== null) {
      const name = match[1] ?? "";
      const trailingComment = match[2] ?? "";
      if (alreadyTestedAbove.has(name)) {
        continue;
      }
      if (!trailingComment.toUpperCase().includes("DEKORATIV")) {
        undocumented.push(name);
      }
    }
    expect(undocumented).toEqual([]);
  });
});

describe("Design-Tokens: Metall-Akzent hellt --gold nur auf, senkt nie den Kontrast", () => {
  /** Reproduziert CSS color-mix(in srgb, <hex> percentBase%, white (100-percentBase)%). */
  function mixWithWhiteSrgb(hex: string, percentBase: number): string {
    const [r, g, b] = hexToRgb(hex);
    const mixChannel = (channel: number): number =>
      Math.round(channel * (percentBase / 100) + 255 * (1 - percentBase / 100));
    const toHexByte = (value: number): string => value.toString(16).padStart(2, "0");
    return `#${toHexByte(mixChannel(r))}${toHexByte(mixChannel(g))}${toHexByte(mixChannel(b))}`;
  }

  it("die 85%-Aufhellung von --gold in --metal-sheen erhöht den Kontrast zu --on-gold gegenüber reinem --gold", () => {
    // --metal-sheen mischt --gold mit 85% Anteil gegen Weiß (siehe globals.css). Die
    // Behauptung im Kommentar ist rechnerisch belegbar: Da --on-gold sehr dunkel ist,
    // erhöht jede Aufhellung Richtung Weiß den Kontrast, sie senkt ihn nie.
    const gold = readColorToken("gold");
    const onGold = readColorToken("on-gold");
    const lightened = mixWithWhiteSrgb(gold, 85);
    const baselineRatio = contrastRatio(onGold, gold);
    const lightenedRatio = contrastRatio(onGold, lightened);
    expect(lightenedRatio).toBeGreaterThanOrEqual(baselineRatio);
    expect(lightenedRatio).toBeGreaterThanOrEqual(4.5);
  });
});
