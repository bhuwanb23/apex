// Shared season → start-year normalization for the sport fetchers.
// Accepts "2024-25" or "2024" and returns the season start year ("2024").
// Throws for unresolvable values (e.g. the manager's 'current' placeholder)
// instead of sending a NaN query param the APIs reject with a 400.
export function toSeasonYear(season: string): string {
  const startYear = season.split('-')[0];
  if (startYear !== undefined && /^\d{4}$/.test(startYear)) return startYear;
  throw new Error(`Cannot map season "${season}" to a season year`);
}
