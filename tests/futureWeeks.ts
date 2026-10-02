import type { SummaryMap } from '../src/competitions.ts';

/** Adds scheduled (pending) weeks to the week 3 fixture, as the updater publishes them. Away teams rotate so opponents change. */
export function withFutureWeeks(summaries: SummaryMap, weeks: number[]): SummaryMap {
  const copy = structuredClone(summaries);
  for (const summary of Object.values(copy)) {
    if (!summary) continue;
    const base = (summary.weeklyMatchups ?? []).filter(item => item.week === summary.week);
    for (const week of weeks) {
      const shift = week - summary.week;
      base.forEach((matchup, index) => {
        summary.weeklyMatchups!.push({
          id: `${week}-${100 + week * 10 + index}`, week, status: 'pending',
          homeTeamId: matchup.homeTeamId, awayTeamId: base[(index + shift) % base.length].awayTeamId,
          homeScore: null, awayScore: null, homeProjected: null, awayProjected: null,
        });
      });
    }
  }
  return copy;
}
