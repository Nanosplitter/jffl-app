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
