import { byeWeek } from './byeWeeks.ts';
import { compareByLineup } from './lineups.ts';
import { managerFor } from './reference.ts';
import { LEAGUES, type LeagueSlug, type WeekLineup, type WeekLineupPlayer } from './types.ts';

export type ShameReason = 'out' | 'ir' | 'bye';

export interface ShameEntry {
  id: string;
  name: string;
  position: string;
  proTeam: string;
  slot: string;
  reason: ShameReason;
}

export interface ShameGroup {
  slug: LeagueSlug;
  teamId: string;
  manager: string;
  entries: ShameEntry[];
}

export function shameLabel(reason: ShameReason) {
  if (reason === 'out') return 'OUT at kickoff';
  if (reason === 'ir') return 'IR at kickoff';
  return 'BYE';
}

/** Latest NFL kickoff on the scoreboard Matchday uses. Missing times stay out of the result. */
export function lastKickoff(games: Record<string, { kickoff?: string | null } | null | undefined> | null | undefined) {
  let latest: number | null = null;
  for (const game of Object.values(games ?? {})) {
    const at = game?.kickoff ? Date.parse(game.kickoff) : NaN;
    if (!Number.isFinite(at)) continue;
    if (latest == null || at > latest) latest = at;
  }
  return latest;
}

function persistedReason(player: WeekLineupPlayer): ShameReason | null {
  const reason = player.locked?.reason;
  const at = player.locked?.at;
  if ((reason !== 'out' && reason !== 'ir') || typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  return reason;
}

function byeIsLocked(week: number, currentWeek: number, games: Parameters<typeof lastKickoff>[0], now: number) {
  if (week < currentWeek) return true;
  if (week !== currentWeek) return false;
  const last = lastKickoff(games);
  return last != null && now >= last;
}

function reasonFor(player: WeekLineupPlayer, week: number, byesLocked: boolean): ShameReason | null {
  if (!player.id || !player.name || !player.slot || player.slot === 'BE' || player.slot === 'IR') return null;
  const locked = persistedReason(player);
  if (locked) return locked;
  return byesLocked && byeWeek(player.proTeam) === week ? 'bye' : null;
}

/** Locked OUT and IR starters, plus bye starters once no later kickoff can replace them. */
export function shameWall(
  rosters: Partial<Record<LeagueSlug, { weeklyLineups?: WeekLineup[] } | null | undefined>>,
  week: number,
  currentWeek: number,
  games: Parameters<typeof lastKickoff>[0],
  now: number,
): ShameGroup[] {
  if (!Number.isFinite(week) || week < 1) return [];
  const byesLocked = byeIsLocked(week, currentWeek, games, now);
  const rows = new Map<string, ShameEntry & { slug: LeagueSlug; teamId: string }>();
  for (const meta of LEAGUES) {
    for (const lineup of rosters[meta.slug]?.weeklyLineups ?? []) {
      if (lineup.week !== week || !lineup.teamId) continue;
      for (const player of lineup.players) {
        const reason = reasonFor(player, week, byesLocked);
        if (!reason) continue;
        const key = `${meta.slug}:${lineup.teamId}:${player.id}`;
        const existing = rows.get(key);
        if (existing && (existing.reason !== 'bye' || reason === 'bye')) continue;
        rows.set(key, {
          slug: meta.slug,
          teamId: lineup.teamId,
          id: player.id,
          name: player.name,
          position: player.position,
          proTeam: player.proTeam,
          slot: player.slot,
          reason,
        });
      }
    }
  }
  const grouped = new Map<string, ShameGroup>();
  for (const row of rows.values()) {
    const key = `${row.slug}:${row.teamId}`;
    const group = grouped.get(key) ?? {
      slug: row.slug,
      teamId: row.teamId,
      manager: managerFor(row.slug, row.teamId)?.manager ?? 'Team',
      entries: [],
    };
    group.entries.push(row);
    grouped.set(key, group);
  }
  const leagueRank = (slug: LeagueSlug) => LEAGUES.findIndex(meta => meta.slug === slug);
  return [...grouped.values()]
    .map(group => ({ ...group, entries: group.entries.slice().sort(compareByLineup) }))
    .sort((a, b) => leagueRank(a.slug) - leagueRank(b.slug) || a.manager.localeCompare(b.manager) || a.teamId.localeCompare(b.teamId));
}
