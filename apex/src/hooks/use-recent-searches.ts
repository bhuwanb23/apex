/** Persisted recent searches — last 5 queries stored locally (plan: Screen 17). */

import { useCallback, useEffect, useState } from 'react';

import { storage } from '@/lib/storage';

const STORAGE_KEY = 'aqx.recentSearches.v1';
const MAX = 5;

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Hydrate once from storage at mount.
  useEffect(() => {
    storage
      .getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setRecent(parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX));
          } catch {
            // ignore corrupt value
          }
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  /** Add a query to the top of the list (deduped, capped at 5) and persist. */
  const addRecentSearch = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setRecent(prev => {
      const next = [q, ...prev.filter(r => r !== q)].slice(0, MAX);
      storage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { recent, addRecentSearch, loaded };
}
