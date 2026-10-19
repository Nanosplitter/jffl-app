import { byeWeek } from './byeWeeks.ts';
import { currentCupMatchesForTeam, scoreFor, type SummaryMap } from './competitions.ts';
import { kickoffLabel } from './kickoff.ts';
import { lineupWouldWin, type LineupCandidate } from './lineups.ts';
import { gameProgress, toOddsStarter, type OddsStarter } from './liveOdds.ts';
import { playerSpread } from './cupOdds.ts';
import { managerFor, type ManagerReference } from './reference.ts';
import type { LeagueSlug, LiveGame, RosteredPlayer } from './types.ts';

const PACE_GAP = 1;
const WINDOW_ORDER = ['TNF', 'FRI', 'SAT', 'SUN 1PM', 'SUN 4PM', 'SNF', 'MNF', 'Time TBD'];

export interface MatchdaySide {
  slug: LeagueSlug;
  teamId: string;
  manager: string;
  offset: number;
  score: number | null;
  projected: number | null;
}

export interface MatchdayMatch {
  id: string;
  kind: 'league' | 'cup';
  label: string;
  href: string;
  week: number;
  status: 'live' | 'final' | 'upcoming';
  left: MatchdaySide;
  right: MatchdaySide | null;
}

export type BoardStatus = 'playing' | 'yet' | 'bye' | 'done';

export interface BoardRow {
  player: RosteredPlayer;
  status: BoardStatus;
  gap: number | null;
  progress: number;
  /** Usual weekly scoring range for this player. */
  spread: number;
  detail: string;
  window: string;
}

export interface PlayerBoard {
  playing: BoardRow[];
  above: BoardRow[];
  below: BoardRow[];
  yet: { window: string; players: BoardRow[] }[];
  bye: BoardRow[];
  done: BoardRow[];
}

const eastern = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });

/** Kickoff bucket for chart markers and the yet-to-play list. */
export function kickoffWindow(kickoff: string | null | undefined): string | null {
  if (!kickoff) return null;
  const date = new Date(kickoff);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(eastern.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  if (!parts.weekday || !Number.isFinite(hour)) return null;
  if (parts.weekday === 'Thu') return 'TNF';
  if (parts.weekday === 'Mon') return 'MNF';
  if (parts.weekday === 'Sat') return 'SAT';
  if (parts.weekday === 'Fri') return 'FRI';
  if (parts.weekday === 'Sun') {
    if (hour >= 20) return 'SNF';
    if (hour >= 15) return 'SUN 4PM';
    return 'SUN 1PM';
  }
  return parts.weekday.toUpperCase();
}

export function priorLegOffset(weeks: readonly number[], scores: readonly (number | null)[], currentWeek: number, finals?: readonly boolean[]): number {
  let total = 0;
  for (let index = 0; index < weeks.length; index += 1) {
    if (weeks[index] >= currentWeek) continue;
    if (finals && !finals[index]) continue;
    const score = scores[index];
    if (score == null || !Number.isFinite(score)) continue;
    total += score;
  }
  return Math.round(total * 100) / 100;
}

export function matchTotal(score: number | null, offset: number): number | null {
  if (score == null) return offset > 0 ? offset : null;
  if (!Number.isFinite(score) || !Number.isFinite(offset)) return null;
  return Math.round((score + offset) * 100) / 100;
}

function side(slug: LeagueSlug, teamId: string | null, offset: number, score: number | null, projected: number | null): MatchdaySide | null {
  if (!teamId) return null;
  return { slug, teamId, manager: managerFor(slug, teamId)?.manager ?? 'Team', offset, score, projected };
}

function weekLine(data: SummaryMap, participant: ManagerReference, week: number) {
  const summary = data[participant.slug];
  const current = summary?.week === week ? summary.matchups.find(item => item.homeTeamId === participant.teamId || item.awayTeamId === participant.teamId) : undefined;
  const weekly = summary?.weeklyMatchups?.find(item => item.week === week && (item.homeTeamId === participant.teamId || item.awayTeamId === participant.teamId));
  const source = current ?? weekly;
  if (!source) return { score: null, projected: null };
  const home = source.homeTeamId === participant.teamId;
  return {
    score: home ? source.homeScore : source.awayScore,
    projected: home ? source.homeProjected : source.awayProjected,
  };
}

/** League matchup for this week, then any cup tie that scores this week. The followed side is on the left. */
export function matchdayMatches(data: SummaryMap, slug: LeagueSlug, teamId: string): MatchdayMatch[] {
  const summary = data[slug];
  if (!summary) return [];
  const week = summary.week;
  const matches: MatchdayMatch[] = [];
  const weekly = summary.weeklyMatchups?.find(item => item.week === week && (item.homeTeamId === teamId || item.awayTeamId === teamId));
  const board = summary.matchups.find(item => item.homeTeamId === teamId || item.awayTeamId === teamId);
  const source = weekly ?? board;
  if (source) {
    const home = source.homeTeamId === teamId;
    const status = weekly?.status === 'final' ? 'final' : weekly?.status === 'pending' ? 'upcoming' : 'live';
    matches.push({
      id: `league-${source.id}`,
      kind: 'league',
      label: summary.leagueName,
      href: `/league/${slug}/match/${source.id}`,
      week,
      status,
      left: side(slug, teamId, 0, home ? source.homeScore : source.awayScore, home ? source.homeProjected : source.awayProjected)!,
      right: side(slug, home ? source.awayTeamId : source.homeTeamId, 0, home ? source.awayScore : source.homeScore, home ? source.awayProjected : source.homeProjected),
    });
  }
  for (const item of currentCupMatchesForTeam(data, slug, teamId)) {
    if (!item.weeks.includes(week) || item.match.status === 'bye') continue;
    const onA = item.match.a.participant?.slug === slug && item.match.a.participant.teamId === teamId;
    const mine = onA ? item.match.a : item.match.b;
    const other = onA ? item.match.b : item.match.a;
    if (!mine.participant) continue;
    const mineLine = weekLine(data, mine.participant, week);
    const otherLine = other.participant ? weekLine(data, other.participant, week) : { score: null, projected: null };
    const offset = (participant: ManagerReference | null, legs: (number | null)[]) => {
      if (!participant) return 0;
      return priorLegOffset(item.weeks, legs, week, item.weeks.map(legWeek => legWeek < week && scoreFor(data, participant, legWeek).final));
    };
    const status = item.match.status === 'final' || item.match.status === 'tied' ? 'final' : item.match.status === 'live' ? 'live' : 'upcoming';
    matches.push({
      id: item.match.id,
      kind: 'cup',
      label: `${item.cupName} · ${item.roundName}`,
      href: `/cups/${item.cupId}/match/${item.match.id}`,
      week,
      status,
      left: side(mine.participant.slug, mine.participant.teamId, offset(mine.participant, mine.legs), mineLine.score, mineLine.projected)!,
      right: other.participant ? side(other.participant.slug, other.participant.teamId, offset(other.participant, other.legs), otherLine.score, otherLine.projected) : null,
    });
  }
  return matches;
}

function rowDetail(status: BoardStatus, game: LiveGame | undefined, kickoff: string | null | undefined) {
  if (status === 'bye') return 'Bye';
  if (status === 'yet') return kickoffLabel(kickoff) ?? 'Yet to play';
  const clock = game?.detail || (status === 'done' ? 'Final' : 'Playing');
  return game?.opponent ? `${clock} · vs ${game.opponent}` : clock;
}

function classify(player: RosteredPlayer, game: LiveGame | undefined, progress: number, week: number): BoardStatus {
  if (byeWeek(player.proTeam) === week) return 'bye';
  if (game?.state === 'post' || progress >= 1) return 'done';
  if (game?.state === 'in' || (player.weekPoints != null && progress < 1) || (progress > 0 && progress < 1)) return 'playing';
  return 'yet';
}

/** Starters grouped by what they are doing in this week's NFL slate. */
export function playerBoard(starters: readonly RosteredPlayer[], games: Record<string, LiveGame> | null | undefined, now: number, week: number): PlayerBoard {
  const rows = starters.map(player => {
    const game = player.proTeam ? games?.[player.proTeam] : undefined;
    const progress = gameProgress(game, player.kickoff ?? game?.kickoff ?? null, now, now);
    const status = classify(player, game, progress, week);
    const pace = status === 'done' ? 1 : progress;
    const gap = (status === 'playing' || status === 'done') && player.weekPoints != null && player.projectedPoints != null
      ? player.weekPoints - player.projectedPoints * pace
      : null;
    const window = status === 'bye' ? 'Bye' : kickoffWindow(player.kickoff ?? game?.kickoff) ?? 'Time TBD';
    const starter = toOddsStarter(player, week);
    const spread = playerSpread(starter.position, starter.previousPoints);
    return { player, status, gap, progress, spread, detail: rowDetail(status, game, player.kickoff ?? game?.kickoff), window };
  });
  const byGap = (direction: number) => rows
    .filter(row => row.gap != null && Math.abs(row.gap) >= PACE_GAP && Math.sign(row.gap) === direction)
    .sort((a, b) => (b.gap! - a.gap!) * direction || a.player.name.localeCompare(b.player.name));
  const yetRows = rows.filter(row => row.status === 'yet');
  const windows = [...new Set(yetRows.map(row => row.window))].sort((a, b) => {
    const rank = (window: string) => {
      const index = WINDOW_ORDER.indexOf(window);
      return index === -1 ? WINDOW_ORDER.length : index;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return {
    playing: rows.filter(row => row.status === 'playing'),
    above: byGap(1),
    below: byGap(-1),
    yet: windows.map(window => ({ window, players: yetRows.filter(row => row.window === window) })),
    bye: rows.filter(row => row.status === 'bye'),
    done: rows.filter(row => row.status === 'done'),
  };
}

export function windowMarkers(players: readonly { kickoff?: string | null }[]): { label: string; at: number }[] {
  const first = new Map<string, number>();
  for (const player of players) {
    const label = kickoffWindow(player.kickoff);
    const at = player.kickoff ? Date.parse(player.kickoff) : NaN;
    if (!label || !Number.isFinite(at)) continue;
    const prior = first.get(label);
    if (prior == null || at < prior) first.set(label, at);
  }
  return [...first.entries()].map(([label, at]) => ({ label, at })).sort((a, b) => a.at - b.at);
}

export function benchPoints(players: readonly RosteredPlayer[], teamId: string): number | null {
  const scored = players.filter(player => player.teamId === teamId && player.group === 'bench' && player.weekPoints != null && Number.isFinite(player.weekPoints));
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, player) => sum + (player.weekPoints ?? 0), 0) * 100) / 100;
}

function formatPoints(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function candidates(players: readonly RosteredPlayer[], teamId: string): LineupCandidate[] {
  return players.filter(player => player.teamId === teamId && (player.group === 'starter' || player.group === 'bench')).map(player => ({
    id: player.id, name: player.name, slot: player.slot, group: player.group, eligibleSlots: player.eligibleSlots, weekPoints: player.weekPoints, position: player.position, proTeam: player.proTeam,
  }));
}

function swingLeft(players: readonly RosteredPlayer[], games: Record<string, LiveGame> | null | undefined, now: number, week: number): OddsStarter | null {
  const board = playerBoard(players.filter(player => player.group === 'starter'), games, now, week);
  const open = [...board.playing, ...board.yet.flatMap(group => group.players)];
  let best: OddsStarter | null = null;
  let bestSpread = -1;
  for (const row of open) {
    const starter = toOddsStarter(row.player, week);
    const spread = playerSpread(starter.position, starter.previousPoints);
    if (spread > bestSpread) { best = starter; bestSpread = spread; }
  }
  return best;
}

export interface MatchFacts {
  catchup: { name: string; amount: number } | 'level' | null;
  swing: { name: string; spread: number } | null;
  bench: { leftName: string; rightName: string; left: number | null; right: number | null } | null;
  lineup: string | null;
}

export function matchFacts(input: {
  leftName: string;
  rightName: string;
  leftProjected: number | null;
  rightProjected: number | null;
  leftPlayers: readonly RosteredPlayer[];
  rightPlayers: readonly RosteredPlayer[];
  leftTeamId: string;
  rightTeamId: string | null;
  games: Record<string, LiveGame> | null | undefined;
  now: number;
  week: number;
  final: boolean;
  leftScore: number | null;
  rightScore: number | null;
  leftTotal: number | null;
  rightTotal: number | null;
}): MatchFacts {
  let catchup: MatchFacts['catchup'] = null;
  if (input.leftProjected != null && input.rightProjected != null) {
    const gap = input.rightProjected - input.leftProjected;
    if (Math.abs(gap) < 0.05) catchup = 'level';
    else if (gap > 0) catchup = { name: input.leftName, amount: gap };
    else catchup = { name: input.rightName, amount: -gap };
  }
  const leftSwing = swingLeft(input.leftPlayers, input.games, input.now, input.week);
  const rightSwing = input.rightTeamId ? swingLeft(input.rightPlayers, input.games, input.now, input.week) : null;
  const swingStarter = [leftSwing, rightSwing].filter((starter): starter is OddsStarter => !!starter).sort((a, b) => playerSpread(b.position, b.previousPoints) - playerSpread(a.position, a.previousPoints))[0] ?? null;
  const swing = swingStarter ? { name: swingStarter.name, spread: playerSpread(swingStarter.position, swingStarter.previousPoints) } : null;
  const leftBench = benchPoints(input.leftPlayers, input.leftTeamId);
  const rightBench = input.rightTeamId ? benchPoints(input.rightPlayers, input.rightTeamId) : null;
  const bench = leftBench != null || rightBench != null ? { leftName: input.leftName, rightName: input.rightName, left: leftBench, right: rightBench } : null;
  let lineup: string | null = null;
  if (input.final && input.rightTeamId && input.leftScore != null && input.rightScore != null && input.leftTotal != null && input.rightTotal != null && input.leftTotal < input.rightTotal) {
    const result = lineupWouldWin(candidates(input.leftPlayers, input.leftTeamId), candidates(input.rightPlayers, input.rightTeamId), input.leftScore, input.rightScore);
    if (result?.swaps.length) {
      const start = result.swaps.map(swap => swap.start.name).join(', ');
      const sit = result.swaps.map(swap => swap.sit.name).join(', ');
      lineup = `Starting ${start} instead of ${sit} would have won.`;
    }
  }
  return { catchup, swing, bench, lineup };
}

export function matchNotes(input: Parameters<typeof matchFacts>[0]): string[] {
  const facts = matchFacts(input);
  const notes: string[] = [];
  if (facts.catchup === 'level') notes.push('Projected to finish level.');
  else if (facts.catchup) notes.push(`${facts.catchup.name} needs ${formatPoints(facts.catchup.amount)} more than projected.`);
  if (facts.swing) notes.push(`Biggest swing left: ${facts.swing.name} (±${formatPoints(facts.swing.spread)}).`);
  if (facts.bench) notes.push(`Bench: ${facts.bench.leftName} ${facts.bench.left == null ? '—' : formatPoints(facts.bench.left)}${facts.bench.rightName ? `, ${facts.bench.rightName} ${facts.bench.right == null ? '—' : formatPoints(facts.bench.right)}` : ''}.`);
  if (facts.lineup) notes.push(facts.lineup);
  return notes;
}
