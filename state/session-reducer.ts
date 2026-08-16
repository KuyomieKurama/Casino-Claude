import type { User } from "@/types/user";

/**
 * Session-Reducer (Auth-Attrappe). Kein Passwort erreicht diesen Reducer — die Action-Typen
 * haben schlicht kein Passwortfeld (Regel 5). Test #12 prüft zusätzlich den persistierten State.
 *
 * Zur Admin-Rolle (Konzept C1): In einer clientseitigen App ist jede Rollenprüfung Anzeigelogik.
 * Deshalb ein offener Umschalter statt eines simulierten Admin-Logins.
 */

/** Ohne „Eingeloggt bleiben“ endet die Demo-Sitzung nach dieser Zeit. */
export const SESSION_TTL_MS = 60 * 60_000;

export type SessionState = {
  hydrated: boolean;
  user: User | null;
  /** Zuletzt registrierter oder angemeldeter Nutzer — für Anzeigename bei erneuter Anmeldung. */
  profile: Pick<User, "id" | "displayName" | "email" | "createdAt"> | null;
  rememberMe: boolean;
  sessionExpiresAt: string | null;
  adminEnabled: boolean;
  /** Wird gesetzt, wenn eine Sitzung beim Laden oder Interagieren als abgelaufen erkannt wurde. */
  expiredNotice: boolean;
};

export type SessionAction =
  | { type: "HYDRATE"; slice: unknown; now: string }
  | { type: "LOGIN"; email: string; rememberMe: boolean; now: string; id: string }
  | { type: "REGISTER"; displayName: string; email: string; now: string; id: string }
  | { type: "LOGOUT" }
  | { type: "CHECK_EXPIRY"; now: string }
  | { type: "DISMISS_EXPIRED" }
  | { type: "SET_ADMIN_ENABLED"; enabled: boolean }
  | { type: "UPDATE_PROFILE"; displayName: string };

export const initialSessionState: SessionState = {
  hydrated: false,
  user: null,
  profile: null,
  rememberMe: false,
  sessionExpiresAt: null,
  adminEnabled: false,
  expiredNotice: false,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseUser(v: unknown): User | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || typeof v.displayName !== "string" || typeof v.email !== "string") return null;
  if (typeof v.createdAt !== "string") return null;
  return {
    id: v.id,
    displayName: v.displayName,
    email: v.email,
    role: v.role === "admin" ? "admin" : "user",
    createdAt: v.createdAt,
  };
}

/** Bewusst eine Allowlist: nur diese Felder werden geschrieben, nie der ganze State. */
export function toPersistedSession(state: SessionState) {
  return {
    user: state.rememberMe || (state.sessionExpiresAt && !state.expiredNotice) ? state.user : null,
    profile: state.profile,
    rememberMe: state.rememberMe,
    sessionExpiresAt: state.sessionExpiresAt,
    adminEnabled: state.adminEnabled,
  };
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "Gast";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Gast";
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "HYDRATE": {
      if (!isRecord(action.slice)) return { ...state, hydrated: true };
      const s = action.slice;
      const user = parseUser(s.user);
      const profile = parseUser(s.profile);
      const rememberMe = s.rememberMe === true;
      const sessionExpiresAt = typeof s.sessionExpiresAt === "string" ? s.sessionExpiresAt : null;
      const adminEnabled = s.adminEnabled === true;
      const expired = !rememberMe && sessionExpiresAt !== null && Date.parse(sessionExpiresAt) <= Date.parse(action.now);
      return {
        hydrated: true,
        user: user && !expired ? user : null,
        profile: profile ? { id: profile.id, displayName: profile.displayName, email: profile.email, createdAt: profile.createdAt } : null,
        rememberMe,
        sessionExpiresAt: expired ? null : sessionExpiresAt,
        adminEnabled,
        expiredNotice: Boolean(user && expired),
      };
    }
    case "LOGIN": {
      const email = action.email.trim().toLowerCase();
      const known = state.profile && state.profile.email.toLowerCase() === email ? state.profile : null;
      const user: User = {
        id: known?.id ?? action.id,
        displayName: known?.displayName ?? displayNameFromEmail(email),
        email,
        role: "user",
        createdAt: known?.createdAt ?? action.now,
      };
      return {
        ...state,
        user,
        profile: { id: user.id, displayName: user.displayName, email: user.email, createdAt: user.createdAt },
        rememberMe: action.rememberMe,
        sessionExpiresAt: action.rememberMe ? null : new Date(Date.parse(action.now) + SESSION_TTL_MS).toISOString(),
        expiredNotice: false,
      };
    }
    case "REGISTER": {
      const email = action.email.trim().toLowerCase();
      const user: User = {
        id: action.id,
        displayName: action.displayName.trim(),
        email,
        role: "user",
        createdAt: action.now,
      };
      return {
        ...state,
        user,
        profile: { id: user.id, displayName: user.displayName, email: user.email, createdAt: user.createdAt },
        rememberMe: true,
        sessionExpiresAt: null,
        expiredNotice: false,
      };
    }
    case "LOGOUT":
      return { ...state, user: null, rememberMe: false, sessionExpiresAt: null, expiredNotice: false };
    case "CHECK_EXPIRY": {
      if (!state.user || state.rememberMe || !state.sessionExpiresAt) return state;
      if (Date.parse(state.sessionExpiresAt) > Date.parse(action.now)) return state;
      return { ...state, user: null, sessionExpiresAt: null, expiredNotice: true };
    }
    case "DISMISS_EXPIRED":
      return state.expiredNotice ? { ...state, expiredNotice: false } : state;
    case "SET_ADMIN_ENABLED":
      return { ...state, adminEnabled: action.enabled };
    case "UPDATE_PROFILE": {
      if (!state.user) return state;
      const displayName = action.displayName.trim() || state.user.displayName;
      const user = { ...state.user, displayName };
      return { ...state, user, profile: { id: user.id, displayName, email: user.email, createdAt: user.createdAt } };
    }
    default:
      return state;
  }
}
