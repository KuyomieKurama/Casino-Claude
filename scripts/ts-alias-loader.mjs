import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Minimaler ESM-Resolve-Hook, NUR für `npm run db:seed` (server/seed/run-seed.ts läuft
 * bewusst als eigenständiges Node-Skript, siehe Kommentar dort — deshalb ohne Next.js/Vite,
 * die den Alias sonst aus tsconfig.json auflösen).
 *
 * Bildet drei Dinge nach, die reines Node-ESM nicht kann, TypeScript-Quellcode im Projekt aber
 * durchgängig nutzt:
 *  1. Den Pfad-Alias `@/` → Repo-Wurzel (tsconfig.json `paths`, CLAUDE.md: "kein src/").
 *  2. Erweiterungslose Importe (übliche Schreibweise bei "bundler"-Modulauflösung).
 *  3. Verzeichnis-Importe wie `./paytables` (data/catalog.ts) → `./paytables/index.ts`.
 *
 * Bewusst kein neues Paket (kein tsconfig-paths, kein tsx): Nur `node:module`/`node:fs`
 * Bordmittel — im Auftrag ist die Paketliste exakt festgelegt.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FILE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];

function isFile(candidate) {
  return existsSync(candidate) && statSync(candidate).isFile();
}

function resolveFilePath(absoluteBasePath) {
  if (isFile(absoluteBasePath)) return absoluteBasePath;

  for (const ext of FILE_EXTENSIONS) {
    const candidate = absoluteBasePath + ext;
    if (isFile(candidate)) return candidate;
  }

  if (existsSync(absoluteBasePath) && statSync(absoluteBasePath).isDirectory()) {
    for (const ext of FILE_EXTENSIONS) {
      const candidate = path.join(absoluteBasePath, `index${ext}`);
      if (isFile(candidate)) return candidate;
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = resolveFilePath(path.join(ROOT, specifier.slice(2)));
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }

  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parentPath = fileURLToPath(context.parentURL);
    const absoluteBase = path.resolve(path.dirname(parentPath), specifier);
    const resolved = resolveFilePath(absoluteBase);
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }

  // Alles andere (node_modules-Pakete, bereits vollständige Pfade) unverändert weiterreichen.
  return nextResolve(specifier, context);
}
