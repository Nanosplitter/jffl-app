import type { RosteredPlayer, WeekLineup } from './types';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'FLEX', 'D/ST', 'K'];

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
  })).sort((a, b) => {
    const slot = (item: RosteredPlayer) => { const index = SLOT_ORDER.indexOf(item.slot); return index === -1 ? SLOT_ORDER.length : index; };
    return slot(a) - slot(b) || a.name.localeCompare(b.name);
  });
}
