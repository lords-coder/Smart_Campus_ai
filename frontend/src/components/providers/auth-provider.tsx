"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, UNAUTHORIZED_EVENT } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/auth";
import type { AuthMe, StudentProfile, FacultyProfile, ParentProfile, User } from "@/lib/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  profile: StudentProfile | FacultyProfile | ParentProfile | null;
  /** True when the previous session was rejected by the API (expired/invalid token). */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Reads the session from the API. Contains no state updates. */
async function readSession(): Promise<AuthMe | null> {
  if (!getToken()) return null;
  try {
    return await api<AuthMe>("/auth/me");
  } catch {
    clearToken();
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | FacultyProfile | ParentProfile | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const applySession = useCallback(async (): Promise<void> => {
    const session = await readSession();
    if (session?.user?.id) {
      setUser(session.user);
      setProfile(session.profile);
      setStatus("authenticated");
      setSessionExpired(false);
    } else {
      clearToken();
      setUser(null);
      setProfile(null);
      setStatus("anonymous");
    }
  }, []);

  const refresh = useCallback(() => applySession(), [applySession]);

  /**
   * A page restored from the browser's back/forward cache resumes with its
   * previous in-memory session - React state still says "authenticated" even
   * though the token has been discarded. Re-validate on restore, and leave the
   * protected URL with a hard navigation: a restored document's client router
   * does not reliably complete a `replace()`, so the URL would otherwise stay on
   * a protected route showing "Redirecting to sign in...".
   */
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void readSession().then((session) => {
        if (session?.user?.id) return;
        clearToken();
        window.location.replace("/login");
      });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const session = await readSession();
      if (!active) return;
      if (session?.user?.id) {
        setUser(session.user);
        setProfile(session.profile);
        setStatus("authenticated");
        setSessionExpired(false);
      } else {
        clearToken();
        setUser(null);
        setProfile(null);
        setStatus("anonymous");
      }
    };

    void run();

    const onUnauthorized = () => {
      if (!active) return;
      clearToken();
      setUser(null);
      setProfile(null);
      setStatus("anonymous");
      setSessionExpired(true);
    };

    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => {
      active = false;
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const result = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email, password },
        token: null,
      });
      setToken(result.token);
      setSessionExpired(false);
      await applySession();
      return result.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Token may already be invalid; local logout still proceeds.
    }
    clearToken();
    setUser(null);
    setProfile(null);
    setSessionExpired(false);
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({ status, user, profile, sessionExpired, login, logout, refresh }),
    [status, user, profile, sessionExpired, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
