/**
 * Global user preferences: selected sports, active sport, role, onboarding
 * completion, and story language. Persisted via `storage` (AsyncStorage) so
 * choices survive restarts, and shared across every module screen.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { storage } from '@/lib/storage';
import { SPORTS, type SportId } from '@/data/mock/sports';

export type RoleId = 'trainer' | 'coach' | 'analyst' | 'fan';

export const ROLES: { id: RoleId; label: string }[] = [
  { id: 'trainer', label: 'Athletic Trainer' },
  { id: 'coach', label: 'Coach' },
  { id: 'analyst', label: 'Front Office Analyst' },
  { id: 'fan', label: 'Fan / Journalist' },
];

interface OnboardingState {
  hasOnboarded: boolean;
  sports: SportId[];
  /** Sport the user is currently viewing across all modules. */
  activeSport: SportId;
  role: RoleId | null;
  defaultModule: 'home' | 'injury' | 'decisions' | 'momentum';
  storyLanguage: 'simple' | 'technical';
}

interface OnboardingContextValue extends OnboardingState {
  completeOnboarding: (sports: SportId[], role: RoleId) => void;
  setSports: (sports: SportId[]) => void;
  setRole: (role: RoleId) => void;
  setDefaultModule: (module: OnboardingState['defaultModule']) => void;
  setStoryLanguage: (language: OnboardingState['storyLanguage']) => void;
  /** Switch the active sport, cycling to the next selected sport. */
  cycleActiveSport: () => void;
}

const STORAGE_KEY = 'aqx.onboarding.v1';

const DEFAULT_STATE: OnboardingState = {
  hasOnboarded: false,
  sports: [SPORTS[0].id],
  activeSport: SPORTS[0].id,
  role: 'analyst',
  defaultModule: 'home',
  storyLanguage: 'simple',
};

/** Keep `activeSport` valid — first selected sport when the current one is unselected. */
function normalizeActiveSport(state: OnboardingState): SportId {
  return state.sports.includes(state.activeSport) ? state.activeSport : state.sports[0];
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

function parseStored(raw: string | null): Partial<OnboardingState> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);

  // Hydrate once from storage at boot.
  useEffect(() => {
    storage.getItem(STORAGE_KEY).then(raw => {
      const stored = parseStored(raw);
      if (stored) setState(prev => ({ ...prev, ...stored }));
    });
  }, []);

  const persist = useCallback((next: OnboardingState) => {
    setState(next);
    storage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const completeOnboarding = useCallback(
    (sports: SportId[], role: RoleId) => {
      persist({ ...DEFAULT_STATE, hasOnboarded: true, sports, activeSport: sports[0], role });
    },
    [persist]
  );

  const setSports = useCallback(
    (sports: SportId[]) => {
      const next: OnboardingState = { ...state, sports };
      persist({ ...next, activeSport: normalizeActiveSport(next) });
    },
    [persist, state]
  );

  const cycleActiveSport = useCallback(() => {
    const next = state.sports[(state.sports.indexOf(state.activeSport) + 1) % Math.max(1, state.sports.length)];
    persist({ ...state, activeSport: next ?? state.activeSport });
  }, [persist, state]);
  const setRole = useCallback((role: RoleId) => persist({ ...state, role }), [persist, state]);
  const setDefaultModule = useCallback(
    (defaultModule: OnboardingState['defaultModule']) => persist({ ...state, defaultModule }),
    [persist, state]
  );
  const setStoryLanguage = useCallback(
    (storyLanguage: OnboardingState['storyLanguage']) => persist({ ...state, storyLanguage }),
    [persist, state]
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ...state,
      completeOnboarding,
      setSports,
      setRole,
      setDefaultModule,
      setStoryLanguage,
      cycleActiveSport,
    }),
    [state, completeOnboarding, setSports, setRole, setDefaultModule, setStoryLanguage, cycleActiveSport]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
