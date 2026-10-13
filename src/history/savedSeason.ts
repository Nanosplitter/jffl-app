import { buildLiveSeason, finishedGames, type LiveSeason } from './liveSeason.ts';
import { MANAGERS, managerFor, type ManagerReference } from '../reference.ts';
import { LEAGUES, type LeagueSlug, type LeagueSummary, type Team } from '../types.ts';
import type { HistorySeason } from './stats.ts';

export interface SavedTeam {
  id: string;
  name?: string | null;
  manager?: string | null;
  jfflSeed?: number | null;
  leagueSeed?: number | null;
  wins?: number | null;
  losses?: number | null;
  ties?: number | null;
  pointsFor?: number | null;
  pointsAgainst?: number | null;
  rank?: number | null;
  regularSeasonRank?: number | null;
  finalStanding?: number | null;
  draftRank?: number | null;
  previousRank?: number | null;
}

export interface SavedMatchup {
  id?: string;
  week: number;
  status?: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
}

export interface SavedLeague {
  updatedAt?: string;
  week?: number;
  completedWeeks?: number;
  teams?: SavedTeam[];
  weeklyMatchups?: SavedMatchup[];
}

/** One season kept after the live snapshots move on. Written by the scheduled refresh. */
export interface SavedHistory {
  schemaVersion: 1;
  season: number;
  leagues: Partial<Record<LeagueSlug, SavedLeague>>;
}

const SLUGS = new Set<LeagueSlug>(LEAGUES.map(meta => meta.slug));

export function isSavedHistory(value: unknown, season: number): value is SavedHistory {
  if (!value || typeof value !== 'object') return false;
  const doc = value as SavedHistory;
  return doc.schemaVersion === 1 && doc.season === season && !!doc.leagues && typeof doc.leagues === 'object';
}

function participants(doc: SavedHistory): ManagerReference[] {
  const listed: ManagerReference[] = [];
  for (const meta of LEAGUES) {
    for (const team of doc.leagues[meta.slug]?.teams ?? []) {
      if (!team.id) continue;
      const known = managerFor(meta.slug, team.id);
      const manager = team.manager || known?.manager || team.name || team.id;
      listed.push({
        ...(known ?? MANAGERS[0]),
        key: `${meta.slug}:${team.id}`,
        slug: meta.slug,
        teamId: String(team.id),
        manager,
        jfflSeed: team.jfflSeed ?? known?.jfflSeed ?? 0,
        leagueSeed: team.leagueSeed ?? known?.leagueSeed ?? 0,
      });
    }
  }
  return listed;
}

function summaryFor(doc: SavedHistory, slug: LeagueSlug, league: SavedLeague): LeagueSummary {
  const teams: Team[] = (league.teams ?? []).filter(team => team.id).map(team => ({
    id: String(team.id),
    name: team.name || team.manager || team.id,
    abbreviation: '',
    rank: team.rank ?? null,
    wins: team.wins ?? null,
    losses: team.losses ?? null,
    ties: team.ties ?? null,
    pointsFor: team.pointsFor ?? null,
    pointsAgainst: team.pointsAgainst ?? null,
    rosterCount: 0,
    previousRank: team.previousRank ?? null,
    draftRank: team.draftRank ?? null,
    finalStanding: team.finalStanding ?? null,
    regularSeasonRank: team.regularSeasonRank ?? null,
  }));
  const week = league.week ?? Math.max(0, ...(league.weeklyMatchups ?? []).map(item => item.week));
  return {
    schemaVersion: 1,
    leagueId: '',
    slug,
    leagueName: LEAGUES.find(meta => meta.slug === slug)?.name ?? slug,
    season: doc.season,
    week,
    updatedAt: league.updatedAt ?? '',
    lastAttemptAt: league.updatedAt ?? '',
    refreshStatus: 'ok',
    teams,
    matchups: [],
    scoring: [],
    completedWeeks: league.completedWeeks,
    weeklyMatchups: (league.weeklyMatchups ?? []).filter(item => typeof item.week === 'number').map(item => ({
      id: item.id || `${item.week}-${item.homeTeamId ?? ''}-${item.awayTeamId ?? ''}`,
      week: item.week,
      status: item.status === 'final' || item.status === 'live' || item.status === 'pending' ? item.status : 'final',
      homeTeamId: item.homeTeamId ?? null,
      awayTeamId: item.awayTeamId ?? null,
      homeScore: item.homeScore ?? null,
      awayScore: item.awayScore ?? null,
      homeProjected: null,
      awayProjected: null,
    })),
  };
}

/** Finished games and season rows from a saved season, using the nicknames stored with that season. */
export function savedSeason(doc: SavedHistory): { games: ReturnType<typeof finishedGames>; seasons: HistorySeason[]; live: LiveSeason } | null {
  const summaries: Partial<Record<LeagueSlug, LeagueSummary>> = {};
  for (const [slug, league] of Object.entries(doc.leagues)) {
    if (!SLUGS.has(slug as LeagueSlug) || !league) continue;
    summaries[slug as LeagueSlug] = summaryFor(doc, slug as LeagueSlug, league);
  }
  const managers = participants(doc);
  const live = buildLiveSeason(summaries, {}, managers.length ? managers : undefined);
  if (!live) return null;
  return {
    live,
    games: finishedGames(live),
    seasons: live.seasons.map(({ standing: _standing, jfflSeed: _jfflSeed, leagueCupSeed: _leagueCupSeed, club: _club, previousRank: _previousRank, week2Rank: _week2Rank, zone: _zone, snapshotPointsAgainst: _against, ...season }) => season),
  };
}
