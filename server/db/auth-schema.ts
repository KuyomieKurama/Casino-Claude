import { boolean, check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { checkIn } from "./check-in";
import { LOGIN_ATTEMPT_SUBJECT_KIND_VALUES, USER_ROLE_VALUES, USER_STATUS_VALUES } from "./enums";

/**
 * Tabellen für better-auth (`user`, `session`, `account`, `verification`) plus `login_attempt`
 * fürs eigene Rate Limiting (server/auth/rate-limit.ts).
 *
 * Warum von Hand statt über den better-auth-Schema-Generator (`@better-auth/cli generate`):
 * Das CLI-Paket ist eine eigenständige Abhängigkeit und war nicht Teil der für diesen Auftrag
 * freigegebenen Installation (nur `better-auth` selbst durfte installiert werden). Die
 * Feldnamen und -typen unten sind deshalb direkt aus den Basis-Schemata der installierten
 * Version übernommen (`@better-auth/core/dist/db/schema/{user,session,account,verification}.d.mts`,
 * Typen `BaseUser`, `BaseSession`, `BaseAccount`, `BaseVerification`) — keine Vermutung, sondern
 * wörtlich abgeschrieben aus der installierten better-auth-Version.
 *
 * Spaltennamen: `snake_case` (Projektstil, siehe schema.ts). JS-Objektschlüssel: `camelCase`,
 * weil der better-auth-Drizzle-Adapter Felder über den Objektschlüssel matcht (nicht über den
 * SQL-Spaltennamen) — sichtbar an `emailVerified`, `providerId` usw. unten.
 *
 * Kein Enum, sondern `text` + `CHECK`: gleiche Begründung wie in server/db/enums.ts.
 */

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Projekteigene Erweiterungen (Auftrag §4), über `user.additionalFields` in
     * server/auth/index.ts an better-auth angebunden. `role`/`status` steuern
     * server/auth/guards.ts.
     *
     * `isGuest`: historisches Feld einer früheren, inzwischen entfernten anonymen
     * Gastkonto-Mechanik (Auftrag „Spielen nur angemeldet" — Registrierung/Login sind jetzt
     * Voraussetzung fürs Spielen, es gibt keinen Anlage-Pfad für neue Gastkonten mehr). Bewusst
     * NICHT per Migration entfernt: Bestehende Zeilen mit `is_guest = true` (aus der Zeit vor
     * dieser Umstellung) bleiben unverändert erhalten — keine Löschung, kein Datenverlust — und
     * das Feld dient admin-seitig (components/admin/UsersTable.tsx) weiterhin als Hinweis, welche
     * Konten aus der alten anonymen Mechanik stammen. Für jedes neue Konto ist der Wert ab jetzt
     * dauerhaft `false` (Standardwert), da kein Code-Pfad ihn mehr auf `true` setzt.
     */
    role: text("role", { enum: USER_ROLE_VALUES }).notNull().default("user"),
    status: text("status", { enum: USER_STATUS_VALUES }).notNull().default("active"),
    isGuest: boolean("is_guest").notNull().default(false),
  },
  (t) => [
    // better-auth verlangt eindeutige E-Mails für die eigene Konto-Verknüpfungslogik.
    uniqueIndex("user_email_unique").on(t.email),
    check("user_role_check", checkIn(t.role, USER_ROLE_VALUES)),
    check("user_status_check", checkIn(t.status, USER_STATUS_VALUES)),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("session_token_unique").on(t.token), index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    /** z. B. "google", "github", "discord" oder "credential" für E-Mail/Passwort. */
    providerId: text("provider_id").notNull(),
    /** ID des Nutzers beim Provider (bei "credential" identisch zur user.id). */
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    /**
     * Passwort-Hash für providerId="credential". Verlässt dieses Modul nie: Repositories/
     * Guards geben nur `server/repositories`-artige Domänentypen ohne dieses Feld zurück
     * (siehe server/auth/guards.ts, das ausschließlich das better-auth-Session-Objekt ohne
     * Konto-Rohdaten zurückgibt).
     */
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("account_user_id_idx").on(t.userId),
    // Ein Provider-Konto (z. B. eine Google-ID) darf nur an ein einziges lokales Konto
    // gebunden sein — verhindert, dass zwei Nutzer dieselbe externe Identität beanspruchen.
    uniqueIndex("account_provider_account_unique").on(t.providerId, t.accountId),
  ],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  /** z. B. die E-Mail-Adresse, für die verifiziert/zurückgesetzt wird. */
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Login-Versuche für die gestaffelte Rate-Begrenzung (server/auth/rate-limit.ts).
 *
 * Kein Klartext: `subjectHash` ist immer ein SHA-256-Hash der normalisierten E-Mail oder der
 * Client-IP, nie der Rohwert — insbesondere die IP darf laut Auftrag nie im Klartext persistiert
 * werden. Der Index deckt genau die Abfrage „wie viele Versuche für dieses Subjekt seit X?".
 */
export const loginAttempt = pgTable(
  "login_attempt",
  {
    id: text("id").primaryKey(),
    subjectKind: text("subject_kind", { enum: LOGIN_ATTEMPT_SUBJECT_KIND_VALUES }).notNull(),
    subjectHash: text("subject_hash").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempt_subject_idx").on(t.subjectKind, t.subjectHash, t.createdAt),
    check("login_attempt_subject_kind_check", checkIn(t.subjectKind, LOGIN_ATTEMPT_SUBJECT_KIND_VALUES)),
  ],
);
