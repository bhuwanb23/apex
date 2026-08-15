import { useEffect, useMemo, useState } from 'react';

import { classifyFreshness, type FreshnessInfo } from '@/lib/freshness';

/**
 * Classifies a backend timestamp's age, re-evaluating once a minute so
 * "Updated 3 hours ago" rolls over correctly while the screen stays open.
 */
export function useFreshness(iso: string | null | undefined): FreshnessInfo {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => classifyFreshness(iso, now), [iso, now]);
}
