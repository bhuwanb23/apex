/**
 * Shared display formatters.
 *
 * Risk scores arrive from the backend with full float precision (e.g.
 * 89.7303821244277). Every screen shows them as compact badges, so we round
 * to at most 2 decimals (trailing zeros trimmed) — "89.73", "95", "0".
 */
export function formatRiskScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return '—';
  const rounded = Math.round(score * 100) / 100;
  return String(rounded);
}

/** Percentage with at most 1 decimal, trailing zeros trimmed (e.g. 71.4, 50). */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}%`;
}
