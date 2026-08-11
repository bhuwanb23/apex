// Workload window computation shared by sport transformers.
// Computes the per-game workload fields on the PlayerGameLogs table:
// back-to-back, days rest before, and games-in-last-N-days windows.

import { differenceInCalendarDays } from 'date-fns';

export interface WorkloadFields {
  /** Previous game was yesterday (1 day rest). */
  backToBack: boolean;
  /** Calendar days since the previous game (null for the first game). */
  daysRestBefore: number | null;
  /** Strictly-previous games within the trailing 7 calendar days. */
  gamesLast7Days: number | null;
  /** Strictly-previous games within the trailing 14 calendar days. */
  gamesLast14Days: number | null;
  /** Strictly-previous games within the trailing 21 calendar days. */
  gamesLast21Days: number | null;
}

/**
 * Computes workload windows for a game list sorted in ascending date order.
 * Windows are strictly *previous* games (the current game is not counted),
 * matching the "days since last game" semantics used for injury-risk baselines.
 */
export function computeWorkloads(dates: Date[]): WorkloadFields[] {
  return dates.map((date, index) => {
    const prev = index > 0 ? dates[index - 1] : null;
    const daysRestBefore = prev ? differenceInCalendarDays(date, prev) : null;
    const countWithin = (days: number): number => {
      let count = 0;
      for (const prior of dates.slice(0, index)) {
        if (differenceInCalendarDays(date, prior) <= days) count += 1;
      }
      return count;
    };
    return {
      backToBack: daysRestBefore === 1,
      daysRestBefore,
      gamesLast7Days: countWithin(7),
      gamesLast14Days: countWithin(14),
      gamesLast21Days: countWithin(21),
    };
  });
}
