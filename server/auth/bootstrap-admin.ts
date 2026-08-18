import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { user } from "@/server/db/auth-schema";

/**
 * Vergibt Admin-Rechte ausschließlich über den Seed-Schritt (`npm run db:seed`), nie über die
 * Anwendung selbst — server/auth/create-auth.ts setzt `role`/`status` mit `input: false`, ein
 * Nutzer kann sich diese Felder also über keine öffentliche API selbst setzen. Diese Funktion
 * ist der einzige Ort, an dem `role` auf "admin" gesetzt wird.
 *
 * No-op, wenn zum Zeitpunkt des Seedens noch kein Konto mit `email` existiert (Admin muss sich
 * zuerst regulär registrieren) — bewusst kein automatisches Anlegen eines Kontos hier, das wäre
 * ein Konto ohne selbst gewähltes Passwort.
 *
 * Bewusst OHNE `import "server-only"`, anders als die übrigen Module in server/auth/: Diese
 * Funktion baut keine eigene Verbindung/liest kein env, sondern arbeitet nur auf einer bereits
 * verbundenen `AppDatabase` — genau wie server/seed/seed.ts und die Repositories in
 * server/repositories/, die aus demselben Grund ebenfalls kein `server-only` tragen. Das macht
 * sie aus dem eigenständigen `server/seed/run-seed.ts`-Skript aufrufbar, das außerhalb von
 * Next.js läuft und an `server-only` sofort abbrechen würde (siehe Kommentar dort).
 */
export async function bootstrapAdmin(db: AppDatabase, email: string): Promise<{ promoted: boolean }> {
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!existing) return { promoted: false };
  if (existing.role === "admin") return { promoted: true };
  await db.update(user).set({ role: "admin", updatedAt: new Date() }).where(eq(user.id, existing.id));
  return { promoted: true };
}
