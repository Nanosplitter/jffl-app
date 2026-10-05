import type { RosteredPlayer, WeekLineup } from './types';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'FLEX', 'D/ST', 'K'];

export function slotLabel(slot: string) {
  if (slot === 'BE') return 'Bench';
  if (slot === 'RB/WR/TE' || slot === 'FLEX') return 'FLEX';
  return slot;
}

export function slotsLabel(slots: string[]) {
  return [...new Set(slots.filter(slot => slot !== 'BE' && slot !== 'IR').map(slotLabel))].join(', ');
}

function slotRank(slot: string) {
  const key = slot === 'FLEX' ? 'RB/WR/TE' : slot;
  const index = SLOT_ORDER.indexOf(key);
  return index === -1 ? SLOT_ORDER.length : index;
}

/** ESPN lineup order. Bench and injured reserve follow the player's position. */
export function compareByLineup<T extends { slot: string; position: string; name: string }>(a: T, b: T) {
  const rank = (player: T) => slotRank(player.slot === 'BE' || player.slot === 'IR' ? player.position : player.slot);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

/** Starters published for a finished week. Null means this snapshot has no lineup for that week yet. */
export function historicalStarters(lineups: WeekLineup[] | undefined, teamId: string, week: number): RosteredPlayer[] | null {
  if (!lineups?.some(lineup => lineup.week === week)) return null;
  const lineup = lineups.find(item => item.week === week && item.teamId === teamId);
  if (!lineup) return [];
  return lineup.players.map(player => ({
    id: player.id,
    teamId,
    name: player.name,
    position: player.position,
    proTeam: player.proTeam,
    slot: player.slot,
    group: 'starter' as const,
    eligibleSlots: [],
    injuryStatus: null,
    weekPoints: player.points,
    projectedPoints: null,
    seasonPoints: null,
    averagePoints: null,
    weekStats: {},
    seasonStats: {},
  })).sort(compareByLineup);
}

/** Points still projected for starters who have not played. Null when this snapshot has no starters for the team. */
export function pointsStillToPlay(players: readonly RosteredPlayer[] | null | undefined, teamId: string | null): number | null {
  if (!players || !teamId) return null;
  const starters = players.filter(player => player.teamId === teamId && player.group === 'starter');
  if (!starters.length) return null;
  return starters.reduce((sum, player) => sum + (player.weekPoints == null && player.projectedPoints != null ? player.projectedPoints : 0), 0);
}

/** The trailer can still take the lead, or a tie still has a starter left. Unknown lineups stay open. */
export function canStillSwing(scoreA: number, scoreB: number, leftA: number | null, leftB: number | null) {
  if (leftA == null || leftB == null) return true;
  const margin = Math.abs(scoreA - scoreB);
  if (margin === 0) return leftA > 0 || leftB > 0;
  return (scoreA < scoreB ? leftA : leftB) > margin;
}

/** The closest game that can still change, or the closest finished game when every lineup is done. */
export function closestOpen<T extends { margin: number; open: boolean }>(rows: readonly T[]): T | undefined {
  const byMargin = (a: T, b: T) => a.margin - b.margin;
  const open = rows.filter(row => row.open).sort(byMargin);
  if (open.length) return open[0];
  return rows.filter(row => row.margin > 0).sort(byMargin)[0];
}

export interface LineupCandidate {
  id: string;
  name: string;
  slot: string;
  group: 'starter' | 'bench' | 'ir';
  eligibleSlots: readonly string[];
  weekPoints: number | null;
  position?: string;
  proTeam?: string;
}

export interface LineupMove {
  id: string;
  name: string;
  points: number;
  position: string;
  proTeam: string;
}

export interface LineupSwap {
  start: LineupMove;
  sit: LineupMove;
}

export interface LineupSwing {
  score: number;
  start: LineupMove[];
  sit: LineupMove[];
  swaps: LineupSwap[];
}

const toCents = (value: number) => Math.round(value * 100);

function canFillSlot(player: LineupCandidate, slot: string) {
  return player.slot === slot || player.eligibleSlots.includes(slot);
}

const MAX_SWAPS = 2;

/**
 * The fewest start/sit moves, and no more than two, that would have beaten the opponent.
 * A starter with no posted score keeps the match undecided. A missing bench
 * score is left out rather than treated as zero.
 */
export function lineupWouldWin(
  team: readonly LineupCandidate[],
  opponent: readonly LineupCandidate[],
  teamScore: number,
  opponentScore: number,
): LineupSwing | null {
  const starters = team.filter(player => player.group === 'starter');
  const opponentStarters = opponent.filter(player => player.group === 'starter');
  if (!starters.length || !opponentStarters.length) return null;
  if (!Number.isFinite(teamScore) || !Number.isFinite(opponentScore)) return null;
  if (toCents(teamScore) > toCents(opponentScore)) return null;
  if (starters.some(player => player.weekPoints == null) || opponentStarters.some(player => player.weekPoints == null)) return null;

  const pool = team.filter(player => (player.group === 'starter' || player.group === 'bench') && player.weekPoints != null && Number.isFinite(player.weekPoints));
  const starterSet = new Set(starters);
  const starterSum = starters.reduce((sum, player) => sum + toCents(player.weekPoints ?? 0), 0);
  const slots = starters.map(player => player.slot);
  const order = slots
    .map((slot, index) => ({ slot, index, options: pool.filter(player => canFillSlot(player, slot)).length }))
    .sort((a, b) => a.options - b.options || a.index - b.index);
  const ceiling = pool.map(player => toCents(player.weekPoints ?? 0)).sort((a, b) => b - a);
  const byPoints = (a: LineupCandidate, b: LineupCandidate) => (b.weekPoints ?? 0) - (a.weekPoints ?? 0) || a.name.localeCompare(b.name);
  const options = new Map(order.map(({ slot }) => {
    const fits = pool.filter(player => canFillSlot(player, slot)).sort((a, b) => Number(starterSet.has(b)) - Number(starterSet.has(a)) || byPoints(a, b));
    return [slot, fits];
  }));

  let best: { changes: number; sumCents: number; picked: LineupCandidate[]; placement: LineupCandidate[] } | null = null;
  const used = new Set<LineupCandidate>();
  const picked: LineupCandidate[] = [];
  const placement: (LineupCandidate | undefined)[] = [];

  const consider = (sumCents: number, changes: number) => {
    const nextScore = toCents(teamScore) + sumCents - starterSum;
    if (nextScore <= toCents(opponentScore) || changes === 0 || changes > MAX_SWAPS) return;
    const signature = picked.map(player => player.id).join('\0');
    const bestSignature = best?.picked.map(player => player.id).join('\0') ?? '';
    if (best && (changes > best.changes || (changes === best.changes && (sumCents < best.sumCents || (sumCents === best.sumCents && signature >= bestSignature))))) return;
    best = { changes, sumCents, picked: picked.slice(), placement: placement.slice() as LineupCandidate[] };
  };

  const walk = (step: number, sumCents: number, changes: number) => {
    if (best && changes > best.changes) return;
    const left = order.length - step;
    if (!left) {
      consider(sumCents, changes);
      return;
    }
    const optimistic = sumCents + ceiling.slice(0, left).reduce((total, value) => total + value, 0);
    if (toCents(teamScore) + optimistic - starterSum <= toCents(opponentScore)) return;
    const { slot, index } = order[step];
    for (const player of options.get(slot) ?? []) {
      if (used.has(player)) continue;
      const nextChanges = changes + (starterSet.has(player) ? 0 : 1);
      if (nextChanges > MAX_SWAPS || (best && nextChanges > best.changes)) continue;
      used.add(player);
      picked.push(player);
      placement[index] = player;
      walk(step + 1, sumCents + toCents(player.weekPoints ?? 0), nextChanges);
      picked.pop();
      placement[index] = undefined;
      used.delete(player);
    }
  };
  walk(0, 0, 0);
  const result = best as { changes: number; sumCents: number; picked: LineupCandidate[]; placement: LineupCandidate[] } | null;
  if (!result) return null;

  const chosen = new Set(result.picked);
  const move = (player: LineupCandidate): LineupMove => ({
    id: player.id,
    name: player.name,
    points: player.weekPoints ?? 0,
    position: player.position ?? '',
    proTeam: player.proTeam ?? '',
  });
  const start = result.picked.filter(player => !starterSet.has(player)).map(move).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const sit = starters.filter(player => !chosen.has(player)).map(move).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  if (!start.length || start.length !== sit.length) return null;
  const pairedStart = new Set<string>();
  const pairedSit = new Set<string>();
  const swaps: LineupSwap[] = [];
  starters.forEach((prev, index) => {
    const next = result.placement[index];
    if (!next || next === prev || starterSet.has(next) || chosen.has(prev)) return;
    swaps.push({ start: move(next), sit: move(prev) });
    pairedStart.add(next.id);
    pairedSit.add(prev.id);
  });
  const restStart = start.filter(player => !pairedStart.has(player.id));
  const restSit = sit.filter(player => !pairedSit.has(player.id));
  restStart.forEach((player, index) => { if (restSit[index]) swaps.push({ start: player, sit: restSit[index] }); });
  swaps.sort((a, b) => b.start.points - a.start.points || a.start.name.localeCompare(b.start.name));
  if (swaps.length !== start.length) return null;
  return { score: (toCents(teamScore) + result.sumCents - starterSum) / 100, start, sit, swaps };
}

/** Every game tied with the closest margin, then the next-closest games until `minimum`. */
export function closestListed<T extends { margin: number; open: boolean }>(rows: readonly T[], minimum = 3): T[] {
  const featured = closestOpen(rows);
  if (!featured) return [];
  const ties = rows.filter(row => row.margin === featured.margin);
  const orderedTies = [
    featured,
    ...ties.filter(row => row !== featured && row.open),
    ...ties.filter(row => row !== featured && !row.open),
  ];
  if (orderedTies.length >= minimum) return orderedTies;
  const rest = rows
    .filter(row => row.margin > featured.margin)
    .sort((a, b) => a.margin - b.margin || Number(b.open) - Number(a.open));
  return [...orderedTies, ...rest.slice(0, minimum - orderedTies.length)];
}
