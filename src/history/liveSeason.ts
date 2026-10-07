import { buildCup, matchupProjection, type CupId, type SummaryMap } from '../competitions.ts';
import { managerFor } from '../reference.ts';
import { LEAGUES, type LeagueRosterSnapshot, type LeagueSlug, type LeagueSummary } from '../types.ts';
import type { GameType, HistoryGame, HistorySeason, LeagueName } from './stats.ts';

export const REGULAR_WEEKS = 14;
const LEAGUE_OF: Record<LeagueSlug, LeagueName> = { premier: 'Premier', championship: 'Championship', 'league-one': 'League One' };
const CUPS: CupId[] = ['jffl', 'premier', 'championship', 'league-one'];

export type LiveStatus = 'final' | 'live';

/** A 2026 game. Scores stay null until ESPN reports them. */
export interface LiveGame {
  season: number;
  league: LeagueName;
  type: GameType;
  round: string;
  week: number | null;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  status: LiveStatus;
}

/** A 2026 manager season. Title ranks stay null until that title is decided; standing is the current position. */
export interface LiveSeasonRow extends HistorySeason {
  standing: number | null;
}

export interface PlayerWeek {
  season: number;
  league: LeagueName;
  week: number;
  team: string;
  player: string;
  position: string;
  proTeam: string;
  slot: string | null;
  starter: number | null;
  points: number | null;
  status: LiveStatus;
}

/** One manager's league game or cup tie in a given week, including weeks not played yet. */
export interface ScheduleRow {
  week: number;
  /** Cup ties can span two weeks; this is the last one. Equal to week for league games. */
  lastWeek: number;
  league: LeagueName;
  type: 'Season' | 'Cup';
  round: string;
  team: string;
  opponent: string;
  score: number | null;
  opponentScore: number | null;
  /** Last ESPN projection saved for that side. Null when none was saved. */
  projected: number | null;
  opponentProjected: number | null;
  status: 'final' | 'live' | 'scheduled';
}

export interface LiveSeason {
  season: number;
  /** Oldest snapshot time across the leagues, so every number is at least this fresh. */
  asOf: string | null;
  week: number | null;
  games: LiveGame[];
  seasons: LiveSeasonRow[];
  players: PlayerWeek[];
  rostersLoaded: boolean;
  /** League games for every scheduled week and every cup tie, from each manager's side. */
  schedule: ScheduleRow[];
  /** The snapshots these rows came from, so cards in answers can be checked against the same data. */
  summaries: SummaryMap;
}

export type RosterMap = Partial<Record<LeagueSlug, LeagueRosterSnapshot>>;

const managerName = (slug: LeagueSlug, teamId: string | null, summary: LeagueSummary) => {
  if (!teamId) return null;
  return managerFor(slug, teamId)?.manager ?? summary.teams.find(team => team.id === teamId)?.name ?? null;
};

const isBench = (slot: string) => slot === 'BE' || slot === 'IR';

function weekStatus(summary: LeagueSummary, teamId: string, week: number): LiveStatus {
  const matchup = summary.weeklyMatchups?.find(item => item.week === week && (item.homeTeamId === teamId || item.awayTeamId === teamId));
  if (matchup) return matchup.status === 'final' ? 'final' : 'live';
  return week < summary.week ? 'final' : 'live';
}

function regularGames(slug: LeagueSlug, summary: LeagueSummary): LiveGame[] {
  const games: LiveGame[] = [];
  for (const matchup of summary.weeklyMatchups ?? []) {
    if (matchup.week > REGULAR_WEEKS || matchup.status === 'pending') continue;
    if (matchup.homeScore === null && matchup.awayScore === null) continue;
    const teamA = managerName(slug, matchup.homeTeamId, summary);
    const teamB = managerName(slug, matchup.awayTeamId, summary);
    if (!teamA || !teamB) continue;
    games.push({
      season: summary.season, league: LEAGUE_OF[slug], type: 'Season', round: String(matchup.week), week: matchup.week,
      teamA, teamB, scoreA: matchup.homeScore, scoreB: matchup.awayScore, status: matchup.status === 'final' ? 'final' : 'live',
    });
  }
  return games;
}

function cupGames(data: SummaryMap, season: number): LiveGame[] {
  const games: LiveGame[] = [];
  for (const id of CUPS) {
    if (id !== 'jffl' && !data[id]) continue;
    if (id === 'jffl' && LEAGUES.some(meta => !data[meta.slug])) continue;
    const cup = buildCup(id, data);
    cup.rounds.forEach((round, index) => {
      const label = index === cup.rounds.length - 1 ? `${index + 1}-Final` : String(index + 1);
      for (const match of round.matches) {
        if (!['final', 'tied', 'live'].includes(match.status)) continue;
        const a = match.a.participant; const b = match.b.participant;
        if (!a || !b) continue;
        games.push({
          season, league: id === 'jffl' ? 'JFFL' : LEAGUE_OF[id], type: 'Cup', round: label, week: null,
          teamA: a.manager, teamB: b.manager, scoreA: match.a.total, scoreB: match.b.total, status: match.status === 'live' ? 'live' : 'final',
        });
      }
    });
  }
  return games;
}

function seasonRows(slug: LeagueSlug, summary: LeagueSummary, champions: Map<CupId, string | null>): LiveSeasonRow[] {
  const regularDone = (summary.completedWeeks ?? 0) >= REGULAR_WEEKS;
  const byPoints = [...summary.teams].filter(team => team.pointsFor !== null).sort((a, b) => b.pointsFor! - a.pointsFor!);
  const jffl = champions.get('jffl'); const leagueCup = champions.get(slug);
  return summary.teams.map(team => {
    const manager = managerName(slug, team.id, summary) ?? team.name;
    const played = team.wins === null || team.losses === null ? null : team.wins + team.losses + (team.ties ?? 0);
    const index = byPoints.findIndex(item => item.id === team.id);
    return {
      season: summary.season, team: manager, league: LEAGUE_OF[slug],
      rankSeason: regularDone ? team.regularSeasonRank ?? team.rank : null,
      rankFinal: team.finalStanding ?? null,
      jfflRank: jffl === undefined || jffl === null ? null : jffl === manager ? 1 : null,
      cupRank: leagueCup === undefined || leagueCup === null ? null : leagueCup === manager ? 1 : null,
      points: team.pointsFor,
      pointsPerWeek: team.pointsFor !== null && played ? Math.round(team.pointsFor / played * 100) / 100 : null,
      wins: team.wins, losses: team.losses, ties: team.ties,
      draft: null,
      pointsRank: index === -1 ? null : index + 1,
      standing: team.rank,
    };
  });
}

function playerWeeks(slug: LeagueSlug, summary: LeagueSummary, roster: LeagueRosterSnapshot): PlayerWeek[] {
  const rows: PlayerWeek[] = [];
  const seen = new Set<string>();
  const add = (row: PlayerWeek, key: string) => { if (!seen.has(key)) { seen.add(key); rows.push(row); } };
  const base = (teamId: string, week: number) => {
    const team = managerName(slug, teamId, summary);
    return team ? { season: summary.season, league: LEAGUE_OF[slug], week, team, status: weekStatus(summary, teamId, week) } : null;
  };
  for (const lineup of roster.weeklyLineups ?? []) {
    const shared = base(lineup.teamId, lineup.week);
    if (!shared) continue;
    for (const player of lineup.players) {
      add({ ...shared, player: player.name, position: player.position, proTeam: player.proTeam, slot: player.slot, starter: isBench(player.slot) ? 0 : 1, points: player.points ?? null },
        `${lineup.week}:${lineup.teamId}:${player.id}`);
    }
  }
  for (const player of roster.players) {
    const current = base(player.teamId, roster.week);
    if (current) {
      add({ ...current, player: player.name, position: player.position, proTeam: player.proTeam, slot: player.slot, starter: player.group === 'starter' ? 1 : 0, points: player.weekPoints ?? null },
        `${roster.week}:${player.teamId}:${player.id}`);
    }
    for (const line of player.weeklyStats ?? []) {
      if (line.week >= roster.week) continue;
      const shared = base(player.teamId, line.week);
      if (!shared) continue;
      add({ ...shared, player: player.name, position: player.position, proTeam: player.proTeam, slot: null, starter: null, points: line.points ?? null },
        `${line.week}:${player.teamId}:${player.id}`);
    }
  }
  return rows;
}

function leagueSchedule(slug: LeagueSlug, summary: LeagueSummary): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const matchup of summary.weeklyMatchups ?? []) {
    const status: ScheduleRow['status'] = matchup.status === 'final' ? 'final' : matchup.status === 'live' || matchup.week === summary.week ? 'live' : matchup.week < summary.week ? 'final' : 'scheduled';
    const home = managerName(slug, matchup.homeTeamId, summary);
    const away = managerName(slug, matchup.awayTeamId, summary);
    const round = matchup.week > REGULAR_WEEKS ? 'Playoffs' : 'Regular season';
    const base = { week: matchup.week, lastWeek: matchup.week, league: LEAGUE_OF[slug], type: 'Season' as const, round, status };
    if (home) rows.push({ ...base, team: home, opponent: away ?? 'Bye', score: matchup.homeScore, opponentScore: matchup.awayScore, projected: matchup.homeProjected, opponentProjected: matchup.awayProjected });
    if (away) rows.push({ ...base, team: away, opponent: home ?? 'Bye', score: matchup.awayScore, opponentScore: matchup.homeScore, projected: matchup.awayProjected, opponentProjected: matchup.homeProjected });
  }
  return rows;
}

function cupSchedule(data: SummaryMap): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const id of CUPS) {
    if (id === 'jffl' ? LEAGUES.some(meta => !data[meta.slug]) : !data[id]) continue;
    const cup = buildCup(id, data);
    for (const round of cup.rounds) {
      for (const match of round.matches) {
        const status: ScheduleRow['status'] = match.status === 'final' || match.status === 'tied' || match.status === 'bye' ? 'final' : match.status === 'live' ? 'live' : 'scheduled';
        const base = { week: Math.min(...match.weeks), lastWeek: Math.max(...match.weeks), league: id === 'jffl' ? 'JFFL' as const : LEAGUE_OF[id], type: 'Cup' as const, round: `${cup.name} ${round.name}`, status };
        const sides = [[match.a, match.b], [match.b, match.a]] as const;
        for (const [own, other] of sides) {
          if (!own.participant) continue;
          const opponent = other.participant?.manager ?? (match.status === 'bye' ? 'Bye' : other.label || 'To be decided');
          const projected = matchupProjection(data, own.participant, match.weeks);
          const opponentProjected = other.participant ? matchupProjection(data, other.participant, match.weeks) : null;
          rows.push({ ...base, team: own.participant.manager, opponent, score: own.total, opponentScore: other.total, projected, opponentProjected });
        }
      }
    }
  }
  return rows;
}

/** Turns the shared league and roster snapshots into 2026 archive rows. Returns null until a league snapshot is loaded. */
export function buildLiveSeason(summaries: SummaryMap, rosters: RosterMap = {}): LiveSeason | null {
  const loaded = LEAGUES.filter(meta => summaries[meta.slug]);
  if (!loaded.length) return null;
  const season = summaries[loaded[0].slug]!.season;
  const champions = new Map<CupId, string | null>();
  for (const id of CUPS) {
    if (id === 'jffl' ? loaded.length < LEAGUES.length : !summaries[id]) continue;
    champions.set(id, buildCup(id, summaries).champion?.manager ?? null);
  }
  const games: LiveGame[] = [];
  const seasons: LiveSeasonRow[] = [];
  const players: PlayerWeek[] = [];
  const schedule: ScheduleRow[] = [];
  for (const { slug } of loaded) {
    const summary = summaries[slug]!;
    schedule.push(...leagueSchedule(slug, summary));
    games.push(...regularGames(slug, summary));
    seasons.push(...seasonRows(slug, summary, champions));
    const roster = rosters[slug];
    if (roster) players.push(...playerWeeks(slug, summary, roster));
  }
  games.push(...cupGames(summaries, season));
  schedule.push(...cupSchedule(summaries));
  schedule.sort((a, b) => a.week - b.week || a.type.localeCompare(b.type) || a.league.localeCompare(b.league) || a.team.localeCompare(b.team));
  const stamps = loaded.map(meta => summaries[meta.slug]!.updatedAt).filter(Boolean).sort();
  return {
    season, asOf: stamps[0] ?? null, week: Math.max(...loaded.map(meta => summaries[meta.slug]!.week)),
    games, seasons, players, rostersLoaded: LEAGUES.every(meta => !!rosters[meta.slug]), schedule, summaries,
  };
}

/** Finished 2026 games with both scores, in archive shape, for record books and head-to-head counts. */
export function finishedGames(live: LiveSeason | null | undefined): HistoryGame[] {
  if (!live) return [];
  return live.games.filter((game): game is LiveGame & { scoreA: number; scoreB: number } => game.status === 'final' && game.scoreA !== null && game.scoreB !== null)
    .map(({ status: _status, ...game }) => game);
}
