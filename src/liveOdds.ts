import { byeWeek } from './byeWeeks.ts';
import { playerSpread } from './cupOdds.ts';
import { scoreFor, type CupMatch, type SummaryMap } from './competitions.ts';
import { standardNormalCdf } from './projections.ts';
import type { LeagueLiveSnapshot, LeagueSlug, LiveGame, RosteredPlayer, ScoreSeries } from './types.ts';

const GAME_MS = 3.25 * 60 * 60 * 1000;
const NOW_WINDOW_MS = 90_000;

export interface OddsStarter {
  name: string;
  position: string;
  proTeam: string | null;
  weekPoints: number | null;
  projectedPoints: number | null;
  previousPoints: readonly number[];
  kickoff: string | null;
}

export interface ChancePoint {
  t: number;
  chance: number;
  scoreLeft: number | null;
  scoreRight: number | null;
  projectedLeft: number | null;
  projectedRight: number | null;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function parsed(value: string | null | undefined) {
  if (!value) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : NaN;
}

/** How much of this player's NFL game is complete at `at`. A missing kickoff stays at 0. */
export function gameProgress(game: LiveGame | null | undefined, kickoff: string | null | undefined, at: number, now: number): number {
  const start = parsed(kickoff ?? game?.kickoff);
  if (game && Math.abs(at - now) <= NOW_WINDOW_MS) {
    if (game.state === 'post') return 1;
    if (game.state === 'pre') return 0;
    return clamp01(game.progress);
  }
  const ended = parsed(game?.endedAt);
  const finish = Number.isFinite(ended) ? ended : Number.isFinite(start) ? start + GAME_MS : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) {
    if (game?.state === 'post' && Number.isFinite(ended) && at >= ended) return 1;
    return game?.state === 'post' ? 1 : 0;
  }
  if (at <= start) return 0;
  if (at >= finish) return 1;
  return (at - start) / (finish - start);
}

function stillOpen(player: OddsStarter, games: Record<string, LiveGame> | null | undefined, now: number, week: number) {
  if (byeWeek(player.proTeam) === week) return false;
  const game = player.proTeam ? games?.[player.proTeam] : undefined;
  if (game?.state === 'post') return false;
  const progress = gameProgress(game, player.kickoff ?? game?.kickoff ?? null, now, now);
  return progress < 1;
}

/**
 * Time warp that shrinks long quiet stretches between recorded points (for
 * example overnight or between game windows) so lines do not run flat and
 * then jump. Times outside the recorded span keep their real spacing.
 */
export function collapseGaps(times: readonly number[], gapMs = 90 * 60 * 1000, keepMs = 10 * 60 * 1000) {
  const sorted = [...times].filter(Number.isFinite).sort((a, b) => a - b);
  const real: number[] = [];
  const warped: number[] = [];
  sorted.forEach((time, index) => {
    if (index === 0) { real.push(time); warped.push(time); return; }
    const gap = time - real[index - 1];
    real.push(time);
    warped.push(warped[index - 1] + (gap > gapMs ? keepMs : gap));
  });
  const map = (value: number, from: number[], to: number[]) => {
    if (!from.length) return value;
    if (value <= from[0]) return to[0] + (value - from[0]);
    const last = from.length - 1;
    if (value >= from[last]) return to[last] + (value - from[last]);
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (from[mid] <= value) lo = mid; else hi = mid;
    }
    const span = from[hi] - from[lo];
    return span <= 0 ? to[lo] : to[lo] + ((value - from[lo]) / span) * (to[hi] - to[lo]);
  };
  return { toX: (time: number) => map(time, real, warped), fromX: (x: number) => map(x, warped, real) };
}

/**
 * Chart scale for a score forecast. A finish that is farther away than the
 * scores already recorded is squeezed so the cone never outgrows that history.
 */
export function scoreChartScale(startMs: number, nowMs: number, endMs: number) {
  const past = Math.max(nowMs - startMs, 0);
  const future = Math.max(endMs - nowMs, 0);
  const pastWeight = Math.max(past, 30 * 60 * 1000);
  const futureWeight = Math.min(future, pastWeight);
  const compressed = future - futureWeight > 60_000;
  const toX = (time: number) => compressed && time > nowMs ? nowMs + ((time - nowMs) / future) * futureWeight : time;
  const fromX = (x: number) => compressed && x > nowMs ? nowMs + ((x - nowMs) / futureWeight) * future : x;
  return { compressed, min: nowMs - pastWeight, max: nowMs + futureWeight, toX, fromX };
}

/** When the last starter still on the field should be done. */
export function forecastEnd(starters: readonly OddsStarter[], games: Record<string, LiveGame> | null | undefined, now: number, week: number): number {
  let end = now;
  for (const player of starters) {
    if (!stillOpen(player, games, now, week)) continue;
    const game = player.proTeam ? games?.[player.proTeam] : undefined;
    const start = parsed(player.kickoff ?? game?.kickoff);
    const finish = Number.isFinite(start) ? start + GAME_MS : NaN;
    if (Number.isFinite(finish) && finish > end) end = finish;
  }
  return end;
}

/** Variance still left for starters whose games are not final. A posted score does not close it. */
export function openVariance(starters: readonly OddsStarter[], games: Record<string, LiveGame> | null | undefined, now: number, week: number): number {
  let variance = 0;
  for (const player of starters) {
    if (!stillOpen(player, games, now, week)) continue;
    const game = player.proTeam ? games?.[player.proTeam] : undefined;
    const progress = gameProgress(game, player.kickoff ?? game?.kickoff ?? null, now, now);
    const spread = playerSpread(player.position, player.previousPoints) * Math.sqrt(1 - progress);
    variance += spread * spread;
  }
  return variance;
}

/** Remaining uncertainty. A scored or bye starter adds none. Variance shrinks with game progress. */
export function sideVariance(starters: readonly OddsStarter[], games: Record<string, LiveGame> | null | undefined, at: number, now: number, week: number): number {
  let variance = 0;
  for (const player of starters) {
    if (player.weekPoints != null || byeWeek(player.proTeam) === week) continue;
    const game = player.proTeam ? games?.[player.proTeam] : undefined;
    const progress = gameProgress(game, player.kickoff ?? game?.kickoff ?? null, at, now);
    const spread = playerSpread(player.position, player.previousPoints);
    variance += spread * spread * (1 - progress);
  }
  return variance;
}

/** Chance the left side finishes ahead. The mean is ESPN's live projected total, plus any finished cup leg. */
export function liveWinChance(
  meanLeft: number | null,
  meanRight: number | null,
  varianceLeft: number,
  varianceRight: number,
  offsetLeft = 0,
  offsetRight = 0,
): { left: number; right: number } | 'level' | null {
  if (meanLeft == null || meanRight == null) return null;
  if (![meanLeft, meanRight, varianceLeft, varianceRight, offsetLeft, offsetRight].every(Number.isFinite)) return null;
  if (varianceLeft < 0 || varianceRight < 0) return null;
  const left = meanLeft + offsetLeft;
  const right = meanRight + offsetRight;
  const variance = varianceLeft + varianceRight;
  if (variance === 0) {
    if (left === right) return 'level';
    return left > right ? { left: 100, right: 0 } : { left: 0, right: 100 };
  }
  const chance = Math.min(100, Math.max(0, Math.round(standardNormalCdf((left - right) / Math.sqrt(variance)) * 100)));
  return { left: chance, right: 100 - chance };
}

function held(series: ScoreSeries | null | undefined, key: 's' | 'p', at: number): number | null | undefined {
  if (!series) return undefined;
  let found: number | null | undefined;
  for (let index = 0; index < series.t.length; index += 1) {
    if (series.t[index] > at) break;
    found = series[key][index];
  }
  return found;
}

function plus(value: number | null | undefined, offset: number): number | null | undefined {
  if (value == null) return value;
  if (!Number.isFinite(value)) return undefined;
  return Math.round((value + offset) * 100) / 100;
}

/** One point per timestamp, holding the other side's last score. A side with no sample yet is skipped. */
export function winChanceSeries(
  left: ScoreSeries | null | undefined,
  right: ScoreSeries | null | undefined,
  varianceAt: (atMs: number) => { left: number; right: number },
  offsetLeft = 0,
  offsetRight = 0,
): ChancePoint[] {
  const times = [...new Set([...(left?.t ?? []), ...(right?.t ?? [])])].filter(time => Number.isFinite(time)).sort((a, b) => a - b);
  const points: ChancePoint[] = [];
  for (const time of times) {
    const projectedLeft = plus(held(left, 'p', time), offsetLeft);
    const projectedRight = plus(held(right, 'p', time), offsetRight);
    if (projectedLeft == null || projectedRight == null) continue;
    const spread = varianceAt(time * 1000);
    const chance = liveWinChance(projectedLeft, projectedRight, spread.left, spread.right);
    if (!chance) continue;
    points.push({
      t: time,
      chance: chance === 'level' ? 50 : chance.left,
      scoreLeft: plus(held(left, 's', time), offsetLeft) ?? null,
      scoreRight: plus(held(right, 's', time), offsetRight) ?? null,
      projectedLeft,
      projectedRight,
    });
  }
  return points;
}

export function withNow(series: ScoreSeries | null | undefined, nowSec: number, score: number | null, projected: number | null): ScoreSeries | null {
  if (!series && score == null && projected == null) return null;
  const base = series ?? { t: [], s: [], p: [] };
  if (base.t.length && base.t[base.t.length - 1] >= nowSec) return base;
  if (base.t.length && base.s[base.s.length - 1] === score && base.p[base.p.length - 1] === projected) return base;
  return { t: [...base.t, nowSec], s: [...base.s, score], p: [...base.p, projected] };
}

export interface ChanceSide {
  projected: number | null;
  offset?: number;
  starters: readonly OddsStarter[];
  week: number;
}

export function liveMatchChance(input: { left: ChanceSide; right: ChanceSide; games: Record<string, LiveGame> | null | undefined; now?: number }): { left: number; right: number } | 'level' | null {
  if (!input.left.starters.length || !input.right.starters.length) return null;
  const now = input.now ?? Date.now();
  return liveWinChance(
    input.left.projected,
    input.right.projected,
    sideVariance(input.left.starters, input.games, now, now, input.left.week),
    sideVariance(input.right.starters, input.games, now, now, input.right.week),
    input.left.offset ?? 0,
    input.right.offset ?? 0,
  );
}

export function toOddsStarter(player: RosteredPlayer, week: number): OddsStarter {
  const previousPoints: number[] = [];
  for (const row of player.weeklyStats ?? []) {
    if (row.week === week || row.points == null || !Number.isFinite(row.points)) continue;
    previousPoints.push(row.points);
  }
  return {
    name: player.name,
    position: player.position,
    proTeam: player.proTeam,
    weekPoints: player.weekPoints,
    projectedPoints: player.projectedPoints,
    previousPoints,
    kickoff: player.kickoff ?? null,
  };
}

function weekProjection(data: SummaryMap, slug: LeagueSlug, teamId: string): number | null {
  const matchup = data[slug]?.matchups.find(item => item.homeTeamId === teamId || item.awayTeamId === teamId);
  if (!matchup) return null;
  const value = matchup.homeTeamId === teamId ? matchup.homeProjected : matchup.awayProjected;
  return value != null && Number.isFinite(value) ? value : null;
}

function cupSide(side: CupMatch['a'], weeks: readonly number[], data: SummaryMap, players: Partial<Record<LeagueSlug, readonly RosteredPlayer[] | null | undefined>>): ChanceSide | null {
  const participant = side.participant;
  if (!participant) return null;
  const summary = data[participant.slug];
  if (!summary || !weeks.includes(summary.week)) return null;
  const roster = players[participant.slug];
  if (!roster) return null;
  let offset = 0;
  for (let index = 0; index < weeks.length; index += 1) {
    if (weeks[index] >= summary.week) continue;
    const leg = scoreFor(data, participant, weeks[index]);
    if (!leg.final || leg.score == null) return null;
    offset += leg.score;
  }
  const starters = roster.filter(player => player.teamId === participant.teamId && player.group === 'starter').map(player => toOddsStarter(player, summary.week));
  return { projected: weekProjection(data, participant.slug, participant.teamId), offset, starters, week: summary.week };
}

/** Live chance for a cup tie. Null when a live snapshot cannot price the open leg. */
export function cupLiveChance(
  match: Pick<CupMatch, 'weeks' | 'a' | 'b'>,
  data: SummaryMap,
  players: Partial<Record<LeagueSlug, readonly RosteredPlayer[] | null | undefined>>,
  live: Partial<Record<LeagueSlug, LeagueLiveSnapshot | null | undefined>>,
  now = Date.now(),
): { left: number; right: number } | 'level' | null {
  const slugs = [match.a.participant?.slug, match.b.participant?.slug].filter((slug): slug is LeagueSlug => !!slug);
  if (!slugs.length || slugs.some(slug => !live[slug])) return null;
  const left = cupSide(match.a, match.weeks, data, players);
  const right = cupSide(match.b, match.weeks, data, players);
  if (!left || !right) return null;
  const games = Object.assign({}, ...slugs.map(slug => live[slug]?.games ?? {}));
  return liveMatchChance({ left, right, games, now });
}
