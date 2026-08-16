import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Schichtregeln aus dem Konzept (§3):
 *  - lib/ importiert nichts aus components/, app/ oder state/
 *  - data/ importiert nur aus types/
 *  - components/ui/ kennt weder Context noch Fachdaten
 *  - LocalStorage wird ausschließlich in lib/storage.ts angefasst
 */
const noStorageOutsideStorageModule = {
  "no-restricted-globals": [
    "error",
    { name: "localStorage", message: "LocalStorage nur in lib/storage.ts verwenden." },
    { name: "sessionStorage", message: "Storage nur in lib/storage.ts verwenden." },
  ],
  "no-restricted-properties": [
    "error",
    { object: "window", property: "localStorage", message: "LocalStorage nur in lib/storage.ts verwenden." },
    { object: "globalThis", property: "localStorage", message: "LocalStorage nur in lib/storage.ts verwenden." },
  ],
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts"],
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    ignores: ["lib/storage.ts", "**/*.test.{ts,tsx}", "test/**"],
    rules: noStorageOutsideStorageModule,
  },
  {
    files: ["lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/components/*", "@/app/*", "@/state/*", "../components/*", "../app/*", "../state/*"], message: "lib/ darf keine UI- oder State-Module importieren." },
          ],
        },
      ],
    },
  },
  {
    files: ["data/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/*", "@/app/*", "@/state/*", "../components/*", "../app/*", "../state/*"],
              message: "data/ enthält Daten, keine Oberfläche und keinen Zustand.",
            },
            {
              // Ausnahme mit Absicht: `lib/paytable` und `lib/rng` sind reine, seiteneffektfreie
              // Helfer zum Bauen und Prüfen von Auszahlungstabellen. Sie hier zu verbieten hätte
              // nur zur Folge, dass jede Datendatei denselben Erzeuger dupliziert — genau die
              // Wiederholung, die die Schichtregel verhindern soll.
              group: ["@/lib/*", "../lib/*", "!@/lib/paytable", "!@/lib/rng"],
              message: "data/ darf aus lib/ nur die Tabellen-Helfer (paytable, rng) verwenden.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/state/*", "@/data/*", "../../state/*", "../../data/*"], message: "components/ui/ enthält keine Fachlogik und kennt keinen Context." },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
