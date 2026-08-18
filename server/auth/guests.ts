import "server-only";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { AppDatabase } from "@/server/db/types";
import { account, session, user } from "@/server/db/auth-schema";
import { REMEMBER_ME_SESSION_SECONDS } from "./session-durations";

/**
 * Gastkonten: anonymes Konto anlegen und an eine Sitzung binden, später bei Registrierung oder
 * OAuth-Anmeldung auf dasselbe Konto "aufwerten" statt ein zweites anzulegen.
 *
 * Warum eigenständig statt über better-auths `anonymous`-Plugin: Das Plugin legt beim Aufwerten
 * (`onLinkAccount`) ein VÖLLIG NEUES Nutzerkonto an und löscht anschließend das anonyme Konto
 * (node_modules/better-auth/dist/plugins/anonymous/types.d.mts, `onLinkAccount({anonymousUser,
 * newUser, ctx})` — zwei getrennte Konten, keine Identität). Der Auftrag verlangt ausdrücklich
 * das Gegenteil: „Konto-ID bleibt erhalten, damit Wallet und Historie später mitwandern". Ein
 * Wechsel der ID würde jede künftige Fremdschlüsselbeziehung (Wallet, Rundenhistorie) auf ein
 * inzwischen gelöschtes Konto zeigen lassen. Deshalb wird hier direkt auf den von better-auth
 * verwalteten Tabellen (`user`, `session`, `account`) gearbeitet — dieselben Tabellen, nur ohne
 * den ID-wechselnden Plugin-Mechanismus.
 *
 * Passwort-Hashing: `hashPassword` aus `better-auth/crypto` — derselbe Algorithmus (Scrypt), den
 * better-auth auch für reguläre Registrierungen verwendet, damit ein aufgewertetes Konto sich
 * beim Login nicht anders verhält als eines, das direkt über `/sign-up/email` entstanden ist.
 */

export interface GuestAccount {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
}

/** Erzeugt eine kollisionsfreie, klar als Gastkonto erkennbare Platzhalter-E-Mail. */
function guestEmail(userId: string): string {
  return `guest+${userId}@guest.invalid`;
}

/** Legt ein anonymes Konto an (kein Passwort, `is_guest = true`) und bindet es an eine neue Sitzung. */
export async function createGuestAccount(db: AppDatabase): Promise<GuestAccount> {
  const userId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REMEMBER_ME_SESSION_SECONDS * 1000);

  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id: userId,
      name: "Gast",
      email: guestEmail(userId),
      emailVerified: false,
      isGuest: true,
    });
    await tx.insert(session).values({
      id: crypto.randomUUID(),
      userId,
      token: sessionToken,
      expiresAt,
    });
  });

  return { userId, sessionToken, expiresAt };
}

export class GuestUpgradeError extends Error {}

/**
 * Liest das Gastkonto MIT Zeilensperre (`SELECT ... FOR UPDATE`).
 *
 * Befund 3 des Security-Reviews: Ohne Sperre lesen zwei GLEICHZEITIGE Aufwertungen derselben
 * Gastsitzung beide `isGuest === true`, bevor eine der beiden Transaktionen ihr `UPDATE`
 * committet — beide würden dann parallel einen eigenen `account`-Datensatz anlegen und `user`
 * überschreiben, Ergebnis: zwei Provider-Verknüpfungen auf einem Konto, aber nur eine
 * "gewonnene" E-Mail (inkonsistenter Endzustand). `FOR UPDATE` sperrt die Zeile ab dem `SELECT`
 * bis zum Ende der Transaktion (`db.transaction(...)` in den Aufrufern unten) — die zweite
 * Transaktion blockiert am `SELECT`, bis die erste committet oder zurückrollt, und sieht danach
 * garantiert den aktuellen Stand (`isGuest === false`), statt eines veralteten. Reines
 * Standard-SQL (kein postgres-spezifisches Feature jenseits von `FOR UPDATE`, das sowohl
 * PGlite als auch PostgreSQL unterstützen) — funktioniert deshalb in Tests (PGlite,
 * server/db/test-harness.ts) und Produktion (PostgreSQL) identisch.
 */
async function loadGuestUser(tx: Pick<AppDatabase, "select">, guestUserId: string) {
  const [row] = await tx.select().from(user).where(eq(user.id, guestUserId)).for("update").limit(1);
  if (!row) throw new GuestUpgradeError(`Gastkonto „${guestUserId}" existiert nicht. Was tun: Zuerst createGuestAccount() aufrufen.`);
  return row;
}

export interface UpgradeToEmailInput {
  guestUserId: string;
  email: string;
  password: string;
  name: string;
}

/**
 * Wertet ein Gastkonto per E-Mail/Passwort-Registrierung auf. Idempotent: ein zweiter Aufruf mit
 * derselben E-Mail auf ein bereits aufgewertetes Konto ändert nichts und wirft nicht — wichtig,
 * falls ein Doppelklick oder ein erneuter Formular-Submit denselben Request auslöst.
 */
export async function upgradeGuestToEmailAccount(db: AppDatabase, input: UpgradeToEmailInput): Promise<{ userId: string }> {
  return db.transaction(async (tx) => {
    const guest = await loadGuestUser(tx, input.guestUserId);

    if (!guest.isGuest) {
      // Bereits aufgewertet: idempotent nur dann tolerieren, wenn es dieselbe Ziel-E-Mail ist —
      // eine ANDERE E-Mail auf ein schon aufgewertetes Konto zu "upgraden" wäre ein Fehler des
      // Aufrufers, kein harmloser Doppel-Request.
      if (guest.email === input.email) return { userId: guest.id };
      throw new GuestUpgradeError(`Konto „${input.guestUserId}" ist bereits kein Gastkonto mehr. Was tun: Kein zweites Mal aufwerten.`);
    }

    const passwordHash = await hashPassword(input.password);

    const [existingCredentialAccount] = await tx
      .select()
      .from(account)
      .where(and(eq(account.userId, input.guestUserId), eq(account.providerId, "credential")))
      .limit(1);

    if (!existingCredentialAccount) {
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        userId: input.guestUserId,
        providerId: "credential",
        accountId: input.guestUserId,
        password: passwordHash,
      });
    }

    await tx
      .update(user)
      .set({ email: input.email, name: input.name, emailVerified: false, isGuest: false, updatedAt: new Date() })
      .where(eq(user.id, input.guestUserId));

    return { userId: input.guestUserId };
  });
}

export interface UpgradeToOAuthInput {
  guestUserId: string;
  provider: string;
  /** ID des Nutzers beim Provider. */
  accountId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * Wertet ein Gastkonto per OAuth-Anmeldung auf. Idempotent: existiert für (provider, accountId)
 * bereits ein Konto-Datensatz auf demselben Nutzer, wird nichts dupliziert.
 */
export async function upgradeGuestToOAuthAccount(db: AppDatabase, input: UpgradeToOAuthInput): Promise<{ userId: string }> {
  return db.transaction(async (tx) => {
    const guest = await loadGuestUser(tx, input.guestUserId);

    if (!guest.isGuest) {
      if (guest.email === input.email) return { userId: guest.id };
      throw new GuestUpgradeError(`Konto „${input.guestUserId}" ist bereits kein Gastkonto mehr. Was tun: Kein zweites Mal aufwerten.`);
    }

    const [existingProviderAccount] = await tx
      .select()
      .from(account)
      .where(and(eq(account.providerId, input.provider), eq(account.accountId, input.accountId)))
      .limit(1);

    if (!existingProviderAccount) {
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        userId: input.guestUserId,
        providerId: input.provider,
        accountId: input.accountId,
      });
    }

    await tx
      .update(user)
      .set({ email: input.email, name: input.name, emailVerified: input.emailVerified, isGuest: false, updatedAt: new Date() })
      .where(eq(user.id, input.guestUserId));

    return { userId: input.guestUserId };
  });
}
