/**
 * Data freshness (integration plan: "Data Freshness — What The App Does When
 * Data Is Old").
 *
 * Every backend response carries a timestamp. The app classifies its age into
 * one of five tiers and communicates it accordingly — a small gray note in the
 * 1-6h band, a yellow/orange/red banner from 6h on. Display-only; the app
 * never re-requests on its own just because data is old (the user does).
 */
import { timeAgo } from '@/lib/time';

export type FreshnessTier = 'fresh' | 'recent' | 'stale' | 'old' | 'ancient';

export interface FreshnessBanner {
  tone: 'yellow' | 'orange' | 'red';
  title: string;
  detail: string;
}

export interface FreshnessInfo {
  tier: FreshnessTier;
  /** Small gray note for the 1-6h band — e.g. "Updated 3 hours ago". */
  note: string | null;
  /** Colored banner for 6h+, with the plan's exact copy. */
  banner: FreshnessBanner | null;
}

const HOUR = 3_600_000;

/** Classify a backend timestamp into a freshness tier (pure — testable). */
export function classifyFreshness(
  iso: string | null | undefined,
  now = Date.now()
): FreshnessInfo {
  if (!iso) return { tier: 'fresh', note: null, banner: null };
  const age = now - new Date(iso).getTime();
  if (Number.isNaN(age) || age < 0) return { tier: 'fresh', note: null, banner: null };

  // < 1 hour: show normally, no special indication.
  if (age < HOUR) return { tier: 'fresh', note: null, banner: null };
  // 1-6 hours: small gray text.
  if (age < 6 * HOUR) return { tier: 'recent', note: `Updated ${timeAgo(iso)}`, banner: null };
  // 6-24 hours: yellow banner.
  if (age < 24 * HOUR)
    return {
      tier: 'stale',
      note: null,
      banner: {
        tone: 'yellow',
        title: 'This data may be outdated',
        detail: 'Pull to refresh to see the latest numbers.',
      },
    };
  // 24-48 hours: orange banner.
  if (age < 48 * HOUR)
    return {
      tier: 'old',
      note: null,
      banner: {
        tone: 'orange',
        title: 'Showing data from yesterday',
        detail: 'Tap to refresh to load the latest data.',
      },
    };
  // Older than 48 hours: red banner.
  return {
    tier: 'ancient',
    note: null,
    banner: {
      tone: 'red',
      title: 'Data is significantly outdated',
      detail: 'Please refresh to see current data.',
    },
  };
}
