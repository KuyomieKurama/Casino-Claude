import "server-only";
import { db } from "@/server/db/client";
import { createAuth } from "./create-auth";

/**
 * Einziger Produktions-Singleton: bindet die better-auth-Fabrik (create-auth.ts) an die echte
 * Verbindung aus server/db/client.ts. Route Handler und (spätere) Server Components importieren
 * ausschließlich diese Instanz. Tests importieren stattdessen `createAuth` direkt und binden es
 * an eine PGlite-Testdatenbank (server/db/test-harness.ts).
 */
export const auth = createAuth(db);
