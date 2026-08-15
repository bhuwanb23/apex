/**
 * Mock authentication (Phase 0 of the real-auth roadmap).
 *
 * For now this is a device-local demo: a single demo account validated
 * against hardcoded credentials, with the session persisted to AsyncStorage.
 * Every future real auth provider (OAuth, JWT against the backend, etc.)
 * should keep this same interface — `login` / `logout` / `user` — so the
 * screens that consume it (root layout gating, Settings) don't change.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { storage } from '@/lib/storage';

/** Demo account — shown on the login screen with a one-tap fill. */
export const DEMO_CREDENTIALS = {
  email: 'demo@aqx.app',
  password: 'aqx1234',
  name: 'Demo User',
};

export interface AuthUser {
  email: string;
  name: string;
  /** When the session was created (ISO). */
  loggedInAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True once the persisted session (if any) has been read from storage. */
  hydrated: boolean;
  /**
   * Mock sign-in. Returns `{ ok: true }` for the demo account, otherwise
   * `{ ok: false, error }`. Later this becomes a real backend call.
   */
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const STORAGE_KEY = 'aqx.auth.v1';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function parseStored(raw: string | null): AuthUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthUser;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.email !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore the session once at boot (async — allowed after the effect).
  useEffect(() => {
    storage
      .getItem(STORAGE_KEY)
      .then(raw => {
        const stored = parseStored(raw);
        if (stored) setUser(stored);
      })
      .finally(() => setHydrated(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const normalized = email.trim().toLowerCase();
    if (normalized !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
      return {
        ok: false,
        error: 'Invalid email or password. Use the demo account shown below.',
      };
    }
    const next: AuthUser = {
      email: DEMO_CREDENTIALS.email,
      name: DEMO_CREDENTIALS.name,
      loggedInAt: new Date().toISOString(),
    };
    setUser(next);
    await storage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await storage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user != null, hydrated, login, logout }),
    [user, hydrated, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
