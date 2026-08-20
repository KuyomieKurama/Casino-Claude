// Regressionstest gegen zwei verwandte, aber unterschiedliche CSS-Fehlerklassen, die beide zu
// lautlos wirkungslosen Tailwind-Utilities führen (kein Build-Fehler, keine Konsolenmeldung —
// die Klasse steht im DOM, erzeugt aber keine Regel):
//
// 1. Gelöschter Namensraum: app/globals.css setzt --color-*/--radius-*/--shadow-*: initial in
//    @theme inline und definiert danach nur eine Teilmenge neu. Jede Komponente, die eine
//    Tailwind-Standardfarbe/-Radius/-Schatten verwendet, die NICHT in dieser Teilmenge steckt,
//    bekommt keine Regel (Produktionsvorfall: bg-black/60 in MobileMenu.tsx/Modal.tsx — der
//    Overlay-Backdrop war unsichtbar, ohne dass Build, Lint oder Typecheck das anzeigten).
//
// 2. Namenskollision zwischen aktiven Namensräumen: die projekteigene --spacing-*-Skala
//    (xs/sm/md/lg/xl/2xl/3xl, siehe @theme inline) verwendet dieselben Namen wie Tailwinds
//    Standard-Container-Skala. Tailwind löst max-w-*/w-*/min-w-* in dieser Reihenfolge auf:
//    erst --max-width-*/--width-*/--min-width-*, dann --spacing-*, erst danach --container-*.
//    Ohne einen expliziten Guard gewinnt --spacing-* lautlos gegen --container-* — max-w-md
//    wurde z. B. zu 1,25rem statt 28rem und ließ Formulare/Karten auf einen schmalen Streifen
//    kollabieren (Registrierungsseite, components/ui/Modal.tsx).
//
// Beide Mechanismen sind mit Build/Lint/Typecheck NICHT sichtbar, weil beides gültiges CSS
// bzw. gültiges JSX bleibt — nur die erzeugte Regel fehlt oder trifft den falschen Wert. Dieser
// Test liest die tatsächlich in @theme inline definierten Token-Namen aus app/globals.css und
// die tatsächlich in app/ und components/ verwendeten Utility-Klassen und gleicht beides ab,
// statt sich auf Kommentare oder manuelle Prüfung zu verlassen.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwindcssPostcss from "@tailwindcss/postcss";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const GLOBALS_CSS_PATH = path.join(ROOT, "app", "globals.css");
const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");

/** Inhalt des @theme inline-Blocks aus app/globals.css (ohne die umschließenden Klammern). */
function themeInlineBlock(): string {
  const match = css.match(/@theme inline\s*{([\s\S]*?)\n}/);
  if (!match) throw new Error("@theme inline-Block wurde nicht in app/globals.css gefunden.");
  return match[1] ?? "";
}

const themeBlock = themeInlineBlock();

/** Alle Namen, die im @theme inline-Block für einen Namensraum-Präfix definiert sind, z. B.
 * definedNames("color") → {"base", "surface", ..., "overlay", "transparent", "current"}. */
function definedNames(themePrefix: string): Set<string> {
  const pattern = new RegExp(`--${themePrefix}-([a-z0-9-]+):`, "g");
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(themeBlock)) !== null) names.add(m[1]!);
  return names;
}

/** true, wenn `--{themePrefix}-*: initial;` im @theme inline-Block steht. */
function isNamespaceReset(themePrefix: string): boolean {
  return new RegExp(`--${themePrefix}-\\*:\\s*initial\\s*;`).test(themeBlock);
}

// ─── Quellcode einlesen (nur app/ und components/ — hier stehen die className-Strings) ──────
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const sourceFiles = [...collectSourceFiles(path.join(ROOT, "app")), ...collectSourceFiles(path.join(ROOT, "components"))];
const sourceContents = sourceFiles.map((file) => readFileSync(file, "utf-8")).join("\n\x00\n");

/** Findet Utility-Klassen der Form `${prefix}-${name}` (optionaler Zahlenschritt/Opacity-Modifier)
 * als eigenständiges Wort in einem className-String. */
function usesUtility(prefix: string, name: string): boolean {
  const pattern = new RegExp(`[\\s"'\`:]${prefix}-${name}(-[0-9]{2,3})?(/[0-9]{1,3})?[\\s"'\`}]`);
  return pattern.test(sourceContents);
}

describe("Regressionstest: gelöschte Namensräume (--color-*/--radius-*/--shadow-*: initial)", () => {
  const colorNames = definedNames("color");
  const radiusNames = definedNames("radius");
  const shadowNames = definedNames("shadow");

  it("--color-*, --radius-* und --shadow-* sind weiterhin auf initial gesetzt — sonst prüft dieser Test die falsche Annahme", () => {
    expect(isNamespaceReset("color")).toBe(true);
    expect(isNamespaceReset("radius")).toBe(true);
    expect(isNamespaceReset("shadow")).toBe(true);
  });

  // Tailwind v4 Standardpalette (node_modules/tailwindcss/theme.css) — nach --color-*: initial
  // nur noch vorhanden, wenn hier in @theme inline erneut definiert.
  const DEFAULT_COLOR_PALETTE = [
    "black",
    "white",
    "slate",
    "gray",
    "zinc",
    "neutral",
    "stone",
    "red",
    "orange",
    "amber",
    "yellow",
    "lime",
    "green",
    "emerald",
    "cyan",
    "sky",
    "blue",
    "indigo",
    "violet",
    "purple",
    "fuchsia",
    "pink",
    "rose",
  ];
  const COLOR_UTILITY_PREFIXES = ["bg", "text", "border", "from", "to", "via", "ring", "fill", "stroke", "outline", "decoration", "divide", "accent", "caret"];

  it("keine Komponente verwendet eine gelöschte Tailwind-Standardfarbe (z. B. bg-black)", () => {
    const offenders: string[] = [];
    for (const prefix of COLOR_UTILITY_PREFIXES) {
      for (const paletteName of DEFAULT_COLOR_PALETTE) {
        if (colorNames.has(paletteName)) continue; // in @theme inline erneut definiert, erlaubt
        if (usesUtility(prefix, paletteName)) offenders.push(`${prefix}-${paletteName}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // rounded-full/rounded-none bleiben ausgenommen: beide sind in Tailwind v4 statische
  // Utilities (kein Rückgriff auf --radius-*), siehe kompiliertes CSS — .rounded-full{border-
  // radius:3.40282e+38px}, .rounded-none{border-radius:0}, unabhängig vom Reset.
  const DEFAULT_RADIUS_SCALE = ["sm", "md", "lg", "xl", "2xl", "3xl"];

  it("keine Komponente verwendet eine gelöschte Tailwind-Standard-Radiusstufe (z. B. rounded-lg)", () => {
    const offenders: string[] = [];
    for (const name of DEFAULT_RADIUS_SCALE) {
      if (radiusNames.has(name)) continue;
      if (usesUtility("rounded", name)) offenders.push(`rounded-${name}`);
    }
    expect(offenders).toEqual([]);
  });

  // shadow-none bleibt ausgenommen: statische Utility (box-shadow: 0 0 #0000), kein Rückgriff
  // auf --shadow-*.
  const DEFAULT_SHADOW_SCALE = ["sm", "md", "lg", "xl", "2xl", "inner"];

  it("keine Komponente verwendet eine gelöschte Tailwind-Standard-Schattenstufe (z. B. shadow-lg)", () => {
    const offenders: string[] = [];
    for (const name of DEFAULT_SHADOW_SCALE) {
      if (shadowNames.has(name)) continue;
      if (usesUtility("shadow", name)) offenders.push(`shadow-${name}`);
    }
    expect(offenders).toEqual([]);
  });
});

// Modulweiter Geltungsbereich (statt nur innerhalb eines describe-Blocks): der Kompilierungs-
// Block weiter unten benötigt dieselbe Namensliste und Utility-Zuordnung, um keine zweite,
// potenziell abweichende Quelle der Wahrheit zu pflegen (DRY).
const spacingNames = definedNames("spacing");
const WIDTH_UTILITIES: ReadonlyArray<{ utilityPrefix: string; themePrefix: string }> = [
  { utilityPrefix: "max-w", themePrefix: "max-width" },
  { utilityPrefix: "w", themePrefix: "width" },
  { utilityPrefix: "min-w", themePrefix: "min-width" },
];

describe("Regressionstest: max-w-*/w-*/min-w-* gegen Namenskollision mit --spacing-*", () => {
  it("die projekteigene --spacing-*-Skala definiert weiterhin xs/sm/md/lg/xl/2xl/3xl/4xl/5xl — sonst prüft dieser Test die falsche Annahme", () => {
    expect([...spacingNames].sort()).toEqual(["2xl", "3xl", "4xl", "5xl", "lg", "md", "sm", "xl", "xs"]);
  });

  it.each(WIDTH_UTILITIES)(
    "jede $utilityPrefix-<name>-Verwendung mit einem --spacing-*-Namen hat einen --$themePrefix-<name>-Guard in @theme inline",
    ({ utilityPrefix, themePrefix }) => {
      const guardedNames = definedNames(themePrefix);
      const offenders: string[] = [];
      for (const name of spacingNames) {
        if (guardedNames.has(name)) continue; // Guard vorhanden, keine Kollision möglich
        if (usesUtility(utilityPrefix, name)) offenders.push(`${utilityPrefix}-${name}`);
      }
      expect(offenders).toEqual([]);
    },
  );
});

// ─── Tatsächliche Kompilierung statt nur Token-Namen ─────────────────────────────────────────
//
// Die beiden Blöcke oben stellen sicher, dass die *Guard-Zeilen* in @theme inline vorhanden
// sind — sie verlassen sich dafür auf das im Kommentar in app/globals.css dokumentierte
// Verständnis von Tailwinds interner Auflösungsreihenfolge. Dieser Block kompiliert
// app/globals.css stattdessen mit demselben Tailwind-4-Compiler, den next build über
// @tailwindcss/postcss verwendet (beide bereits vorhandene devDependencies, keine neue
// Abhängigkeit), und prüft die tatsächlich erzeugten Regeln direkt. Er hängt damit nicht von
// der Korrektheit der Kommentar-Doku ab und würde auch eine künftige Änderung an Tailwinds
// interner Auflösungsreihenfolge selbst erkennen, nicht nur eine versehentlich gelöschte
// Guard-Zeile.
//
// Grenze dieses Tests (jsdom berechnet kein Layout): er belegt, welche CSS-Regel für eine
// Klasse erzeugt wird und auf welchen Zahlenwert eine Custom Property auflöst — er belegt NICHT,
// dass ein Element im Browser tatsächlich diese Breite einnimmt (Boxmodell, geerbte Breiten,
// Flex/Grid-Kontext etc. bleiben ungeprüft). Für das im Aufgabentext beschriebene Symptom
// (max-w-md kollabiert auf einen schmalen Streifen) ist die hier geprüfte Zahlenwert-Auflösung
// aber genau die Ursache, nicht nur ein Symptom davon.
describe("Regressionstest: kompiliertes CSS belegt reale Tailwind-Auflösung (nicht nur Token-Namen)", () => {
  // @source inline(...) erzwingt die Erzeugung bestimmter Utilities unabhängig von automatischer
  // Dateisuche; source(none) auf dem @import deaktiviert die automatische, repoweite Inhaltssuche
  // (die Tailwind sonst beim Kompilieren einer echten app/globals.css durchführen würde), damit
  // der Test nicht bei jedem Lauf das gesamte Repository scannt und schnell + deterministisch
  // bleibt (gemessen: unter 100 ms für den gesamten Block).
  async function compileWithClasses(classNames: readonly string[]): Promise<string> {
    const withoutAutoSource = css.replace('@import "tailwindcss";', '@import "tailwindcss" source(none);');
    const virtualEntry = `${withoutAutoSource}\n@source inline("${classNames.join(" ")}");\n`;
    const result = await postcss([tailwindcssPostcss()]).process(virtualEntry, { from: GLOBALS_CSS_PATH });
    return result.css;
  }

  /** Liest den Rohwert einer CSS-Custom-Property aus kompiliertem CSS (erstes Vorkommen). */
  function rawCustomProperty(compiledCss: string, varName: string): string {
    const match = compiledCss.match(new RegExp(`--${varName}:\\s*([^;]+);`));
    if (!match?.[1]) {
      throw new Error(`--${varName} steht nicht im kompilierten CSS — Utility wurde nicht erzeugt oder Variable ungenutzt.`);
    }
    return match[1].trim();
  }

  /** Liest den deklarierten Wert einer CSS-Eigenschaft innerhalb der Regel für einen Selektor
   * (Fenster statt exaktem Klammer-Parsing — für kurze, generierte Utility-Regeln ausreichend
   * robust, siehe ruleWindowContains unten für dieselbe Abwägung). */
  function declaredValue(compiledCss: string, selectorLiteral: string, property: string, windowSize = 300): string {
    const index = compiledCss.indexOf(selectorLiteral);
    if (index === -1) throw new Error(`Selektor "${selectorLiteral}" wurde nicht im kompilierten CSS gefunden — Utility wurde nicht erzeugt.`);
    const windowText = compiledCss.slice(index, index + windowSize);
    const match = windowText.match(new RegExp(`\\b${property}:\\s*([^;]+);`));
    if (!match?.[1]) throw new Error(`Eigenschaft "${property}" wurde für Selektor "${selectorLiteral}" nicht gefunden.`);
    return match[1].trim();
  }

  /** Löst einen CSS-Wert rekursiv zu einem numerischen rem-Wert auf: Literale (z. B. "28rem")
   * direkt, var(--x)-Referenzen über deren tatsächlich im :root/theme-Layer deklarierten
   * Rohwert. Wichtig: Tailwinds "@theme inline" inlined reine var()-Aliase (z. B. --max-width-md:
   * var(--container-md);) direkt in die Utility-Regel — im kompilierten CSS taucht deshalb
   * --container-md auf, NICHT --max-width-md. Diese Funktion geht deshalb vom tatsächlich
   * deklarierten Wert aus, statt den Variablennamen aus dem Theme-Präfix zu raten. */
  function resolveRemValue(compiledCss: string, value: string, guard = 0): number {
    if (guard > 10) throw new Error(`Zirkuläre var()-Kette beim Auflösen von "${value}" (Abbruch nach 10 Schritten).`);
    const varRef = value.match(/^var\(--([a-z0-9-]+)\)$/);
    if (varRef?.[1]) return resolveRemValue(compiledCss, rawCustomProperty(compiledCss, varRef[1]), guard + 1);
    const rem = value.match(/^([\d.]+)rem$/);
    if (!rem?.[1]) throw new Error(`Wert "${value}" ist weder ein rem-Literal noch eine var()-Referenz.`);
    return Number.parseFloat(rem[1]);
  }

  /** Prüft, ob innerhalb eines festen Zeichenfensters nach einem Selektor ein Textfragment steht
   * (statt exaktem Klammer-Parsing — für kurze, generierte Utility-Regeln ausreichend robust). */
  function ruleWindowContains(compiledCss: string, selectorLiteral: string, fragment: string, windowSize = 300): boolean {
    const index = compiledCss.indexOf(selectorLiteral);
    if (index === -1) return false;
    return compiledCss.slice(index, index + windowSize).includes(fragment);
  }

  const WIDTH_PROPERTY_BY_PREFIX: Readonly<Record<string, string>> = {
    "max-w": "max-width",
    w: "width",
    "min-w": "min-width",
  };

  const usedWidthClasses = WIDTH_UTILITIES.flatMap(({ utilityPrefix }) =>
    [...spacingNames]
      .filter((name) => usesUtility(utilityPrefix, name))
      .map((name) => ({ utilityPrefix, name, className: `${utilityPrefix}-${name}` })),
  );

  let widthCompiled: string;
  let overlayCompiled: string;
  let sheetSideCompiled: string;

  beforeAll(async () => {
    // Ein Compile-Lauf für alle Breiten-Utilities zusammen (statt je Test einer) — reduziert die
    // Zahl der Tailwind-Kompilierungen im Testlauf, ohne die Aussagekraft je Klasse zu verlieren.
    [widthCompiled, overlayCompiled, sheetSideCompiled] = await Promise.all([
      compileWithClasses(usedWidthClasses.map((entry) => entry.className)),
      compileWithClasses(["bg-overlay/60", "backdrop:bg-overlay/60"]),
      compileWithClasses(["md:anim-sheet-side"]),
    ]);
  });

  it("mindestens eine max-w-<Name>-Verwendung existiert — sonst prüft dieser Block die falsche Annahme", () => {
    expect(usedWidthClasses.length).toBeGreaterThan(0);
  });

  it("jede tatsächlich verwendete max-w-/w-/min-w-<Name>-Klasse kompiliert auf eine plausible Containerbreite, nicht auf den Abstandswert", () => {
    for (const { utilityPrefix, name, className } of usedWidthClasses) {
      const property = WIDTH_PROPERTY_BY_PREFIX[utilityPrefix];
      if (!property) throw new Error(`Kein CSS-Eigenschaftsname für Präfix "${utilityPrefix}" hinterlegt.`);

      const declared = declaredValue(widthCompiled, `.${className} {`, property);
      const widthRem = resolveRemValue(widthCompiled, declared);
      const spacingRem = resolveRemValue(widthCompiled, rawCustomProperty(widthCompiled, `space-${name}`));

      // Tailwinds kleinste Container-Stufe (3xs) ist 16rem — alles darunter kann für eine
      // xs/sm/md/lg/xl/2xl/3xl-benannte Breitenstufe kein echter Containerwert sein, sondern nur
      // versehentlich der (viel kleinere) projekteigene Abstandswert.
      expect(widthRem, `${className}: ${property} sollte >= 16rem sein, ist aber "${declared}"`).toBeGreaterThanOrEqual(16);
      expect(widthRem, `${className}: darf nicht auf den Abstandswert --space-${name} (${spacingRem}rem) auflösen`).not.toBe(spacingRem);
    }
  });

  it("bg-overlay/60 und backdrop:bg-overlay/60 erzeugen Regeln auf Basis von --overlay-scrim (nicht des gelöschten --color-black)", () => {
    expect(ruleWindowContains(overlayCompiled, ".bg-overlay\\/60", "--overlay-scrim")).toBe(true);
    expect(ruleWindowContains(overlayCompiled, ".backdrop\\:bg-overlay\\/60::backdrop", "--overlay-scrim")).toBe(true);
  });

  it("md:anim-sheet-side erzeugt eine Regel innerhalb einer @media-Bedingung (Beleg, dass die @utility-Variante tatsächlich greift)", () => {
    const selector = ".md\\:anim-sheet-side {";
    const index = sheetSideCompiled.indexOf(selector);
    expect(index, "md:anim-sheet-side hat keine Regel erzeugt").toBeGreaterThan(-1);

    const before = sheetSideCompiled.slice(Math.max(0, index - 150), index);
    expect(before, "die Regel steht nicht direkt in einem @media-Block").toMatch(/@media[^{]*\{\s*$/);

    const after = sheetSideCompiled.slice(index, index + 200);
    expect(after).toContain("animation: sheet-side");
  });
});
