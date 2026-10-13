import { buildCup, matchupProjection, provisionalZone, type CupId, type SummaryMap } from '../competitions.ts';
import { lineupWouldWin, rosterForWeek } from '../lineups.ts';
import { injuryName } from '../injury.ts';
import { projectedWinChance } from '../projections.ts';
import { managerFor, type ManagerReference } from '../reference.ts';
import { LEAGUES, type LeagueRosterSnapshot, type LeagueSlug, type LeagueSummary, type RosteredPlayer } from '../types.ts';
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
  /** JFFL Cup seed, 1 is the top seed. Fixed for 2026. */
  jfflSeed: number | null;
  /** Seed in this manager's own league cup, 1 is the top seed. Fixed for 2026. */
  leagueCupSeed: number | null;
  /** ESPN team name. */
  club: string | null;
  /** Rank after the previous completed week. */
  previousRank: number | null;
  /** Starting rank from the Week 2 commissioner sheet. */
  week2Rank: number | null;
  /** Provisional promotion or relegation band for the current rank. */
  zone: string | null;
  /** ESPN season points against, the number on the standings page. */
  snapshotPointsAgainst: number | null;
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
  /** Current-week roster only. Null on a saved lineup from an earlier week. */
  projected: number | null;
  seasonPoints: number | null;
  averagePoints: number | null;
  /** Empty when the player is healthy or the week has no injury report. */
  injury: string | null;
  status: LiveStatus;
}

/** A would-be lineup from the weekly roundup. The score is what that lineup would have scored. */
export interface SwingRow {
  week: number;
  league: LeagueName;
  team: string;
  opponent: string;
  score: number;
  opponentScore: number;
  wouldScore: number;
  final: boolean;
  swaps: string;
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
  /** Scoreboard win chance while the game is undecided. Null once it is final or a projection is missing. */
  winChance: number | null;
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
  /** Would-be lineups for weeks the snapshots can still reconstruct. */
  swings: SwingRow[];
  /** The snapshots these rows came from, so cards in answers can be checked against the same data. */
  summaries: SummaryMap;
  rosters: RosterMap;
}

export type RosterMap = Partial<Record<LeagueSlug, LeagueRosterSnapshot>>;

const managerName = (slug: LeagueSlug, teamId: string | null, summary: LeagueSummary, roster?: readonly ManagerReference[]) => {
  if (!teamId) return null;
  const listed = roster?.find(item => item.slug === slug && item.teamId === teamId)?.manager;
  if (listed) return listed;
  return managerFor(slug, teamId)?.manager ?? summary.teams.find(team => team.id === teamId)?.name ?? null;
};

const isBench = (slot: string) => slot === 'BE' || slot === 'IR';

function weekStatus(summary: LeagueSummary, teamId: string, week: number): LiveStatus {
  const matchup = summary.weeklyMatchups?.find(item => item.week === week && (item.homeTeamId === teamId || item.awayTeamId === teamId));
  if (matchup) return matchup.status === 'final' ? 'final' : 'live';
  return week < summary.week ? 'final' : 'live';
}

function regularGames(slug: LeagueSlug, summary: LeagueSummary, roster?: readonly ManagerReference[]): LiveGame[] {
  const games: LiveGame[] = [];
  for (const matchup of summary.weeklyMatchups ?? []) {
    if (matchup.week > REGULAR_WEEKS || matchup.status === 'pending') continue;
    if (matchup.homeScore === null && matchup.awayScore === null) continue;
    const teamA = managerName(slug, matchup.homeTeamId, summary, roster);
    const teamB = managerName(slug, matchup.awayTeamId, summary, roster);
    if (!teamA || !teamB) continue;
    games.push({
      season: summary.season, league: LEAGUE_OF[slug], type: 'Season', round: String(matchup.week), week: matchup.week,
      teamA, teamB, scoreA: matchup.homeScore, scoreB: matchup.awayScore, status: matchup.status === 'final' ? 'final' : 'live',
    });
  }
  return games;
}

function cupGames(data: SummaryMap, season: number, roster?: readonly ManagerReference[]): LiveGame[] {
  const games: LiveGame[] = [];
  for (const id of CUPS) {
    if (id !== 'jffl' && !data[id]) continue;
    if (id === 'jffl' && LEAGUES.some(meta => !data[meta.slug])) continue;
    const cup = buildCup(id, data, roster);
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

function seasonRows(slug: LeagueSlug, summary: LeagueSummary, champions: Map<CupId, string | null>, roster?: readonly ManagerReference[]): LiveSeasonRow[] {
  const regularDone = (summary.completedWeeks ?? 0) >= REGULAR_WEEKS;
  const byPoints = [...summary.teams].filter(team => team.pointsFor !== null).sort((a, b) => b.pointsFor! - a.pointsFor!);
  const jffl = champions.get('jffl'); const leagueCup = champions.get(slug);
  return summary.teams.map(team => {
    const manager = managerName(slug, team.id, summary, roster) ?? team.name;
    const played = team.wins === null || team.losses === null ? null : team.wins + team.losses + (team.ties ?? 0);
    const index = byPoints.findIndex(item => item.id === team.id);
    const person = managerFor(slug, team.id);
    return {
      season: summary.season, team: manager, league: LEAGUE_OF[slug],
      rankSeason: regularDone ? team.regularSeasonRank ?? team.rank : null,
      rankFinal: team.finalStanding ?? null,
      jfflRank: jffl === undefined || jffl === null ? null : jffl === manager ? 1 : null,
      cupRank: leagueCup === undefined || leagueCup === null ? null : leagueCup === manager ? 1 : null,
      points: team.pointsFor,
      pointsPerWeek: team.pointsFor !== null && played ? Math.round(team.pointsFor / played * 100) / 100 : null,
      wins: team.wins, losses: team.losses, ties: team.ties,
      pointsRank: index === -1 ? null : index + 1,
      standing: team.rank,
      jfflSeed: person?.jfflSeed ?? null,
      leagueCupSeed: person?.leagueSeed ?? null,
      club: team.name,
      previousRank: team.previousRank ?? null,
      week2Rank: person?.week2Rank ?? null,
      zone: provisionalZone(slug, team.rank),
      draft: team.draftRank ?? person?.draftRank ?? null,
      snapshotPointsAgainst: team.pointsAgainst,
    };
  });
}

const blankPlayer = { projected: null, seasonPoints: null, averagePoints: null, injury: null };

function rosterFacts(player: RosteredPlayer | undefined) {
  if (!player) return blankPlayer;
  return {
    projected: player.projectedPoints,
    seasonPoints: player.seasonPoints,
    averagePoints: player.averagePoints,
    injury: injuryName(player.injuryStatus) ?? null,
  };
}

function playerWeeks(slug: LeagueSlug, summary: LeagueSummary, roster: LeagueRosterSnapshot): PlayerWeek[] {
  const rows: PlayerWeek[] = [];
  const seen = new Set<string>();
  const add = (row: PlayerWeek, key: string) => { if (!seen.has(key)) { seen.add(key); rows.push(row); } };
  const onRoster = (teamId: string, id: string) => roster.players.find(player => player.teamId === teamId && player.id === id);
  const base = (teamId: string, week: number) => {
    const team = managerName(slug, teamId, summary);
    return team ? { season: summary.season, league: LEAGUE_OF[slug], week, team, status: weekStatus(summary, teamId, week) } : null;
  };
  for (const lineup of roster.weeklyLineups ?? []) {
    const shared = base(lineup.teamId, lineup.week);
    if (!shared) continue;
    for (const player of lineup.players) {
      const facts = lineup.week === roster.week ? rosterFacts(onRoster(lineup.teamId, player.id)) : blankPlayer;
      add({ ...shared, ...facts, player: player.name, position: player.position, proTeam: player.proTeam, slot: player.slot, starter: isBench(player.slot) ? 0 : 1, points: player.points ?? null },
        `${lineup.week}:${lineup.teamId}:${player.id}`);
    }
  }
  for (const player of roster.players) {
    const current = base(player.teamId, roster.week);
    if (current) {
      add({ ...current, ...rosterFacts(player), player: player.name, position: player.position, proTeam: player.proTeam, slot: player.slot, starter: player.group === 'starter' ? 1 : 0, points: player.weekPoints ?? null },
        `${roster.week}:${player.teamId}:${player.id}`);
    }
    for (const line of player.weeklyStats ?? []) {
      if (line.week >= roster.week) continue;
      const shared = base(player.teamId, line.week);
      if (!shared) continue;
      add({ ...shared, ...blankPlayer, player: player.name, position: player.position, proTeam: player.proTeam, slot: null, starter: null, points: line.points ?? null },
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
    const chance = status === 'final' ? null : projectedWinChance(matchup.homeProjected, matchup.awayProjected);
    const base = { week: matchup.week, lastWeek: matchup.week, league: LEAGUE_OF[slug], type: 'Season' as const, round, status };
    if (home) rows.push({ ...base, team: home, opponent: away ?? 'Bye', score: matchup.homeScore, opponentScore: matchup.awayScore, projected: matchup.homeProjected, opponentProjected: matchup.awayProjected, winChance: chance?.home ?? null });
    if (away) rows.push({ ...base, team: away, opponent: home ?? 'Bye', score: matchup.awayScore, opponentScore: matchup.homeScore, projected: matchup.awayProjected, opponentProjected: matchup.homeProjected, winChance: chance?.away ?? null });
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
          rows.push({ ...base, team: own.participant.manager, opponent, score: own.total, opponentScore: other.total, projected, opponentProjected, winChance: null });
        }
      }
    }
  }
  return rows;
}

function swingRows(summaries: SummaryMap, rosters: RosterMap): SwingRow[] {
  const rows: SwingRow[] = [];
  for (const { slug } of LEAGUES) {
    const summary = summaries[slug];
    const roster = rosters[slug];
    if (!summary || !roster) continue;
    for (const matchup of summary.weeklyMatchups ?? []) {
      if (matchup.homeScore == null || matchup.awayScore == null || !matchup.homeTeamId || !matchup.awayTeamId) continue;
      const past = matchup.week !== summary.week;
      const side = (teamId: string) => past
        ? rosterForWeek(roster.weeklyLineups, roster.players, teamId, matchup.week) ?? []
        : roster.players.filter(player => player.teamId === teamId);
      const home = side(matchup.homeTeamId);
      const away = side(matchup.awayTeamId);
      for (const item of [
        { teamId: matchup.homeTeamId, opponentId: matchup.awayTeamId, score: matchup.homeScore, opponentScore: matchup.awayScore, team: home, opponent: away },
        { teamId: matchup.awayTeamId, opponentId: matchup.homeTeamId, score: matchup.awayScore, opponentScore: matchup.homeScore, team: away, opponent: home },
      ]) {
        const swing = lineupWouldWin(item.team, item.opponent, item.score, item.opponentScore);
        if (!swing) continue;
        const team = managerName(slug, item.teamId, summary);
        const opponent = managerName(slug, item.opponentId, summary);
        if (!team || !opponent) continue;
        rows.push({
          week: matchup.week, league: LEAGUE_OF[slug], team, opponent, score: item.score, opponentScore: item.opponentScore,
          wouldScore: swing.score, final: matchup.status === 'final',
          swaps: swing.swaps.map(swap => `start ${swap.start.name} (${swap.start.points}) instead of ${swap.sit.name} (${swap.sit.points})`).join('; '),
        });
      }
    }
  }
  return rows;
}

/** Turns the shared league and roster snapshots into archive rows for that season. Returns null until a league snapshot is loaded. `roster` names the managers when the saved season should keep the nicknames from the year it was played. */
export function buildLiveSeason(summaries: SummaryMap, rosters: RosterMap = {}, managers?: readonly ManagerReference[]): LiveSeason | null {
  const loaded = LEAGUES.filter(meta => summaries[meta.slug]);
  if (!loaded.length) return null;
  const season = summaries[loaded[0].slug]!.season;
  const champions = new Map<CupId, string | null>();
  for (const id of CUPS) {
    if (id === 'jffl' ? loaded.length < LEAGUES.length : !summaries[id]) continue;
    champions.set(id, buildCup(id, summaries, managers).champion?.manager ?? null);
  }
  const games: LiveGame[] = [];
  const seasons: LiveSeasonRow[] = [];
  const players: PlayerWeek[] = [];
  const schedule: ScheduleRow[] = [];
  for (const { slug } of loaded) {
    const summary = summaries[slug]!;
    schedule.push(...leagueSchedule(slug, summary));
    games.push(...regularGames(slug, summary, managers));
    seasons.push(...seasonRows(slug, summary, champions, managers));
    const roster = rosters[slug];
    if (roster) players.push(...playerWeeks(slug, summary, roster));
  }
  games.push(...cupGames(summaries, season, managers));
  schedule.push(...cupSchedule(summaries));
  schedule.sort((a, b) => a.week - b.week || a.type.localeCompare(b.type) || a.league.localeCompare(b.league) || a.team.localeCompare(b.team));
  const stamps = loaded.map(meta => summaries[meta.slug]!.updatedAt).filter(Boolean).sort();
  return {
    season, asOf: stamps[0] ?? null, week: Math.max(...loaded.map(meta => summaries[meta.slug]!.week)),
    games, seasons, players, rostersLoaded: LEAGUES.every(meta => !!rosters[meta.slug]), schedule, swings: swingRows(summaries, rosters), summaries, rosters,
  };
}

/** Finished 2026 games with both scores, in archive shape, for record books and head-to-head counts. */
export function finishedGames(live: LiveSeason | null | undefined): HistoryGame[] {
  if (!live) return [];
  return live.games.filter((game): game is LiveGame & { scoreA: number; scoreB: number } => game.status === 'final' && game.scoreA !== null && game.scoreB !== null)
    .map(({ status: _status, ...game }) => game);
}
