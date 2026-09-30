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
