// Regressionstest für das Bewegungssystem aus app/globals.css (Redesign Etappe 1).
//
// Warum eine reine Textprüfung statt Rendering: die hier geprüften Regeln (Staffelungs-Versatz,
// federnde Kurven, Ausgangsdauer, Druckskala, reduced-motion-Verhalten) sind CSS-Selektoren mit
// :nth-child/:active/@media-Bedingungen — jsdom berechnet kein Layout und wertet
// `@media (prefers-reduced-motion: reduce)` nicht aus. Die verlässliche, deterministische Prüfung
// liest deshalb wie in app/design-tokens.test.ts und test/theme-namespace-guard.test.ts die
// tatsächlichen Werte/Regeln direkt aus der CSS-Quelle, statt sich auf eine (in jsdom ohnehin
// nicht aussagekräftige) Layout-Messung zu verlassen.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const GLOBALS_CSS_PATH = path.join(process.cwd(), "app", "globals.css");
const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");

/** Liest den Rohwert eines :root-Custom-Property-Tokens (z. B. "140ms" oder eine cubic-bezier-Funktion). */
function readToken(name: string): string {
  const pattern = new RegExp(`--${name}:\\s*([^;]+);`);
  const match = css.match(pattern);
  if (!match?.[1]) throw new Error(`Token --${name} wurde nicht in app/globals.css gefunden.`);
  return match[1].trim();
}

/** Wandelt einen "<Zahl>ms"-Wert in eine Zahl um. */
function ms(value: string): number {
  const match = value.match(/^([\d.]+)ms$/);
  if (!match?.[1]) throw new Error(`"${value}" ist kein "<Zahl>ms"-Wert.`);
  return Number.parseFloat(match[1]);
}

describe("Bewegungssystem: neue Tokens sind vorhanden und plausibel", () => {
  it("--stagger-step liegt im vorgegebenen 30–50 ms-Korridor", () => {
    const step = ms(readToken("stagger-step"));
    expect(step).toBeGreaterThanOrEqual(30);
    expect(step).toBeLessThanOrEqual(50);
  });

  it("--ease-spring ist eine federnde Kurve (cubic-bezier mit Überschwingen, y-Wert > 1)", () => {
    const value = readToken("ease-spring");
    const match = value.match(/^cubic-bezier\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/);
    expect(match, `--ease-spring ("${value}") ist keine cubic-bezier()-Funktion`).not.toBeNull();
    const y1 = Number.parseFloat(match![2]!);
    const y2 = Number.parseFloat(match![4]!);
    // Ein y-Wert über 1 an einem der beiden Kontrollpunkte erzeugt das Überschwingen, das eine
    // Kurve erst "federnd" macht — eine reine Verzögerungskurve wie --ease-out bleibt <= 1.
    expect(Math.max(y1, y2)).toBeGreaterThan(1);
  });

  it("--ease-in ist zusätzlich zu --ease-out vorhanden (eigene Ausgangskurve)", () => {
    const easeIn = readToken("ease-in");
    const easeOut = readToken("ease-out");
    expect(easeIn).toMatch(/^cubic-bezier\(/);
    expect(easeIn).not.toBe(easeOut);
  });

  it("--dur-exit ist kürzer als --dur-fade, im Korridor von etwa 60–70 % der Eingangsdauer", () => {
    const exit = ms(readToken("dur-exit"));
    const fade = ms(readToken("dur-fade"));
    expect(exit).toBeLessThan(fade);
    const ratio = exit / fade;
    expect(ratio).toBeGreaterThanOrEqual(0.55);
    expect(ratio).toBeLessThanOrEqual(0.75);
  });

  it("--scale-press liegt im vorgegebenen 0,95–1,05-Korridor", () => {
    const scale = Number.parseFloat(readToken("scale-press"));
    expect(scale).toBeGreaterThanOrEqual(0.95);
    expect(scale).toBeLessThanOrEqual(1.05);
    // Druckfeedback ist ein Verkleinern (gedrückt wirken), keine Vergrößerung.
    expect(scale).toBeLessThan(1);
  });

  it("--ease-lux ist eine eigenständige cubic-bezier()-Kurve, unterscheidet sich von --ease-out", () => {
    const easeLux = readToken("ease-lux");
    const easeOut = readToken("ease-out");
    expect(easeLux).toMatch(/^cubic-bezier\(/);
    expect(easeLux).not.toBe(easeOut);
  });
});

describe("Bewegungssystem: geforderte Utilities existieren", () => {
  it("stagger-list staffelt direkte Kinder über :nth-child mit --stagger-step", () => {
    expect(css).toMatch(/\.stagger-list > \*[^{]*\{\s*animation: rise-in/);
    expect(css).toContain("animation-delay: calc(var(--stagger-step) * 0)");
    // Deckelung: ab einer bestimmten Position bleibt die Verzögerung konstant, statt unbegrenzt
    // zu wachsen (siehe Kommentar in globals.css).
    expect(css).toMatch(/:nth-child\(n\+\d+\)\s*\{\s*animation-delay:/);
  });

  it("press-feedback skaliert bei :active mit --scale-press und der federnden Kurve", () => {
    expect(css).toMatch(/\.press-feedback\s*\{[^}]*transition:\s*transform var\(--dur-state\) var\(--ease-spring\)/);
    expect(css).toMatch(/\.press-feedback:active\s*\{\s*transform:\s*scale\(var\(--scale-press\)\);\s*\}/);
  });

  it("eine Zustandswechsel-Utility (anim-state-pop) nutzt die federnde Kurve", () => {
    expect(css).toMatch(/\.anim-state-pop\s*\{\s*animation:\s*state-pop var\(--dur-state\) var\(--ease-spring\) both;/);
  });

  it("transition-exit nutzt die Ausgangsdauer und -kurve (Ausgang kürzer als Eingang)", () => {
    expect(css).toMatch(/\.transition-exit\s*\{[^}]*transition-duration:\s*var\(--dur-exit\);[^}]*transition-timing-function:\s*var\(--ease-in\);/s);
  });
});

describe("Bewegungssystem: prefers-reduced-motion nutzt den vorhandenen Media-Query-Block", () => {
  const mediaBlockMatches = css.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? [];

  it("es existiert weiterhin nur der eine bereits dokumentierte reduced-motion-Block für die neuen Utilities (kein dritter Block)", () => {
    // Die Datei enthielt bereits zwei @media(prefers-reduced-motion)-Blöcke (der zweite besteht
    // aus Spezifitätsgründen ausschließlich für .hover-lift/.hover-elevate, siehe Kommentar davor
    // in globals.css). Die neuen Regeln gehören in den ersten, bereits vorhandenen Block — dieser
    // Test hält die Gesamtzahl fest, damit kein dritter Block schleichend hinzukommt.
    expect(mediaBlockMatches.length).toBe(2);
  });

  it("innerhalb des ersten reduced-motion-Blocks entfallen Transformationen für alle neuen Utilities", () => {
    const firstBlockStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const firstBlockEnd = css.indexOf("\n}", firstBlockStart);
    const block = css.slice(firstBlockStart, firstBlockEnd);

    // .transition-exit verliert dort wie .transition-state/.transition-fade die transform-Eigenschaft.
    expect(block).toMatch(/\.transition-state,\s*\n\s*\.transition-fade,\s*\n\s*\.transition-exit\s*\{/);

    // .anim-state-pop und die gestaffelten Rasterelemente fallen auf reines Ein-/Ausblenden zurück.
    expect(block).toContain(".anim-state-pop");
    expect(block).toContain(".stagger-list > *:not(.anim-panel-in)");
    expect(block).toMatch(/animation-name:\s*fade-in;/);

    // Druckfeedback verliert die Skalierung, bleibt aber als Element (nur Transform entfällt).
    expect(block).toMatch(/\.press-feedback:active\s*\{\s*transform:\s*none;\s*\}/);

    // Neu (Premium-Fundament): .tilt-card verliert die 3D-Neigung im Hover, .anim-float
    // (schwebende Hero-Objekte) entfällt vollständig — beides reine Bewegungs-, keine
    // Sichtbarkeits-Effekte.
    expect(block).toMatch(/\.tilt-card:hover\s*\{\s*transform:\s*none;\s*\}/);
    expect(block).toMatch(/\.anim-float\s*\{\s*animation:\s*none;\s*\}/);
  });
});
