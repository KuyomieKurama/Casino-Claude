"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { User } from "@/types/user";
import { writeSlice } from "@/lib/storage";
import { createId, nowIso } from "@/lib/ids";
import { usePersistence } from "./PersistenceContext";
import { initialSessionState, sessionReducer, toPersistedSession, type SessionState } from "./session-reducer";

type SessionValue = {
  state: SessionState;
  hydrated: boolean;
  user: User | null;
  isLoggedIn: boolean;
  adminEnabled: boolean;
  /** Passwort wird hier bewusst NICHT entgegengenommen — Validieren und Verwerfen passiert im Formular. */
  login: (input: { email: string; rememberMe: boolean }) => void;
  register: (input: { displayName: string; email: string }) => void;
  logout: () => void;
  checkExpiry: () => void;
  dismissExpired: () => void;
  setAdminEnabled: (enabled: boolean) => void;
  updateProfile: (displayName: string) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const persistence = usePersistence();
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);

  useEffect(() => {
    if (persistence.hydrated && !state.hydrated) {
      dispatch({ type: "HYDRATE", slice: persistence.slices.session, now: nowIso() });
    }
  }, [persistence.hydrated, persistence.slices.session, state.hydrated]);

  useEffect(() => {
    if (state.hydrated) writeSlice("session", toPersistedSession(state));
  }, [state]);

  const login = useCallback((input: { email: string; rememberMe: boolean }) => {
    dispatch({ type: "LOGIN", email: input.email, rememberMe: input.rememberMe, now: nowIso(), id: createId("u") });
  }, []);
  const register = useCallback((input: { displayName: string; email: string }) => {
    dispatch({ type: "REGISTER", displayName: input.displayName, email: input.email, now: nowIso(), id: createId("u") });
  }, []);
  const logout = useCallback(() => dispatch({ type: "LOGOUT" }), []);
  const checkExpiry = useCallback(() => dispatch({ type: "CHECK_EXPIRY", now: nowIso() }), []);
  const dismissExpired = useCallback(() => dispatch({ type: "DISMISS_EXPIRED" }), []);
  const setAdminEnabled = useCallback((enabled: boolean) => dispatch({ type: "SET_ADMIN_ENABLED", enabled }), []);
  const updateProfile = useCallback((displayName: string) => dispatch({ type: "UPDATE_PROFILE", displayName }), []);

  const value = useMemo<SessionValue>(
    () => ({
      state,
      hydrated: state.hydrated,
      user: state.user,
      isLoggedIn: state.user !== null,
      adminEnabled: state.adminEnabled,
      login,
      register,
      logout,
      checkExpiry,
      dismissExpired,
      setAdminEnabled,
      updateProfile,
    }),
    [state, login, register, logout, checkExpiry, dismissExpired, setAdminEnabled, updateProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession muss innerhalb von <SessionProvider> verwendet werden.");
  return v;
}
