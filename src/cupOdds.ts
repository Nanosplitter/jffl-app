import { scoreFor, type CupMatch, type SummaryMap } from './competitions.ts';
import { standardNormalCdf } from './projections.ts';
import type { LeagueSlug, RosteredPlayer } from './types.ts';

/** Shrink target for a starter with little weekly history. A few games only partly replace it. */
const POSITION_SPREAD: Record<string, number> = {
  QB: 7.5,
  RB: 8,
  WR: 8,
  TE: 6,
  'D/ST': 5,
  DST: 5,
  DEF: 5,
  K: 3.5,
};
const PRIOR_WEEKS = 4;
const DEFAULT_SPREAD = 7;

export interface PricedStarter {
  position: string;
  weekPoints: number | null;
  projectedPoints: number | null;
  previousPoints: readonly number[];
}

export interface CupSideOutlook {
  legs: readonly (number | null)[];
  finals: readonly boolean[];
  week: number | null;
  starters: readonly PricedStarter[] | null;
}

export interface CupChance { left: number; right: number }

/** Weekly range for one starter. One game or fewer stays on the position target. */
export function playerSpread(position: string, weeklyPoints: readonly number[]): number {
  const prior = POSITION_SPREAD[position] ?? DEFAULT_SPREAD;
  const samples = weeklyPoints.filter(value => Number.isFinite(value));
  if (samples.length < 2) return prior;
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1);
  const blended = (PRIOR_WEEKS * prior * prior + (samples.length - 1) * variance) / (PRIOR_WEEKS + samples.length - 1);
  return Math.sqrt(blended);
}

function priceStarters(starters: readonly PricedStarter[] | null): { mean: number; variance: number } | null {
  if (!starters?.length) return null;
  let mean = 0;
  let variance = 0;
  for (const player of starters) {
    if (player.weekPoints != null) {
      if (!Number.isFinite(player.weekPoints)) return null;
      mean += player.weekPoints;
      continue;
    }
    if (player.projectedPoints == null || !Number.isFinite(player.projectedPoints)) return null;
    mean += player.projectedPoints;
    const spread = playerSpread(player.position, player.previousPoints);
    variance += spread * spread;
  }
  return { mean, variance };
}

/**
 * Chance the left side finishes ahead of the right. Finished legs are certain.
 * An open leg is priced only when it is both leagues' current week.
 * A yet-to-play starter with no projection stays unknown.
 * `'level'` means every starter has played and the totals match.
 */
export function cupWinChance(weeks: readonly number[], left: CupSideOutlook, right: CupSideOutlook): CupChance | 'level' | null {
  if (weeks.length === 0 || left.legs.length !== weeks.length || right.legs.length !== weeks.length) return null;
  if (left.finals.length !== weeks.length || right.finals.length !== weeks.length) return null;
  let meanLeft = 0;
  let meanRight = 0;
  let variance = 0;
  for (let index = 0; index < weeks.length; index += 1) {
    if (left.finals[index] && right.finals[index]) {
      const leftScore = left.legs[index];
      const rightScore = right.legs[index];
      if (leftScore == null || rightScore == null) return null;
      meanLeft += leftScore;
      meanRight += rightScore;
      continue;
    }
    if (left.week !== weeks[index] || right.week !== weeks[index]) return null;
    const pricedLeft = priceStarters(left.starters);
    const pricedRight = priceStarters(right.starters);
    if (!pricedLeft || !pricedRight) return null;
    meanLeft += pricedLeft.mean;
    meanRight += pricedRight.mean;
    variance += pricedLeft.variance + pricedRight.variance;
  }
  if (variance === 0) {
    if (meanLeft === meanRight) return 'level';
    return meanLeft > meanRight ? { left: 100, right: 0 } : { left: 0, right: 100 };
  }
  const leftChance = Math.min(100, Math.max(0, Math.round(standardNormalCdf((meanLeft - meanRight) / Math.sqrt(variance)) * 100)));
  return { left: leftChance, right: 100 - leftChance };
}

function previousPoints(player: RosteredPlayer, currentWeek: number | null) {
  const scores: number[] = [];
  for (const row of player.weeklyStats ?? []) {
    if (row.points == null || !Number.isFinite(row.points)) continue;
    if (currentWeek != null && row.week === currentWeek) continue;
    scores.push(row.points);
  }
  return scores;
}

function sideOutlook(side: CupMatch['a'], weeks: readonly number[], data: SummaryMap, players: Partial<Record<LeagueSlug, readonly RosteredPlayer[] | null | undefined>>): CupSideOutlook {
  const participant = side.participant;
  const summary = participant ? data[participant.slug] : undefined;
  const roster = participant ? players[participant.slug] : null;
  const starters = participant && roster
    ? roster.filter(player => player.teamId === participant.teamId && player.group === 'starter').map(player => ({
      position: player.position,
      weekPoints: player.weekPoints,
      projectedPoints: player.projectedPoints,
      previousPoints: previousPoints(player, summary?.week ?? null),
    }))
    : null;
  return {
    legs: side.legs,
    finals: weeks.map(week => participant ? scoreFor(data, participant, week).final : false),
    week: summary?.week ?? null,
    starters,
  };
}

/** Prices a cup match from published legs and the current starter snapshots. */
export function cupMatchChance(
  match: Pick<CupMatch, 'weeks' | 'a' | 'b'>,
  data: SummaryMap,
  players: Partial<Record<LeagueSlug, readonly RosteredPlayer[] | null | undefined>>,
): CupChance | 'level' | null {
  return cupWinChance(match.weeks, sideOutlook(match.a, match.weeks, data, players), sideOutlook(match.b, match.weeks, data, players));
}
