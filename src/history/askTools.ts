import { buildCup, type CupId } from '../competitions.ts';
import { finalsNote } from '../finalsRematch.ts';
import { slotsLabel } from '../lineups.ts';
import { injuryName } from '../injury.ts';
import { MANAGERS } from '../reference.ts';
import { scoringLabel } from '../scoring.ts';
import { LEAGUES as LEAGUE_META, type LeagueSlug } from '../types.ts';
import {
  JFFL_CUP, LEAGUE_CUP, SUPER_BOWL, WEEKLY,
  careers, draftBuckets, rate, recordBook, roundLabel, titleYears,
  type HistoryGame, type HistorySeason,
} from './stats.ts';
import { playedArchive } from './played.ts';
import { finishedGames, REGULAR_WEEKS, type LiveSeason } from './liveSeason.ts';

export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type ColumnType = 'number' | 'string';
export interface Column { name: string; type: ColumnType }
/** `live` is the in-progress season built from the shared league snapshots. `saved` is each season copied into publicHistory so it stays after that year ends. */
export interface Archive { games: HistoryGame[]; seasons: HistorySeason[]; live?: LiveSeason | null; saved?: LiveSeason[] }

export const TABLES = ['team_games', 'seasons', 'player_weeks'] as const;
export type TableName = (typeof TABLES)[number];

export const FILTER_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'between', 'contains', 'is_null', 'not_null'] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
export const AGG_FUNCTIONS = ['count', 'count_distinct', 'sum', 'mean', 'median', 'min', 'max', 'rate'] as const;
export type AggFn = (typeof AGG_FUNCTIONS)[number];

export interface Filter { field: string; op: FilterOp; value?: string | number | string[] | number[] }
export interface Aggregate { fn: AggFn; field?: string; as?: string; when?: Filter[] }
export interface Sort { field: string; dir?: 'asc' | 'desc' }
/** Keep rows that hold the min or max of `field` inside each `groupBy` bucket. Ties stay. */
export interface Within { groupBy: string[]; fn: 'min' | 'max'; field: string }
export interface Query {
  filters?: Filter[];
  within?: Within;
  groupBy?: string[];
  aggregates?: Aggregate[];
  select?: string[];
  sort?: Sort[];
  limit?: number;
}

export interface Source { tool: string; args: Record<string, unknown> }
export interface Dataset {
  id: string;
  title: string;
  columns: Column[];
  rows: Row[];
  source: Source;
  caveats: string[];
  truncated: boolean;
  matched: number;
  summary?: Record<string, unknown>;
}

export const MAX_ROWS = 1000;
export const DEFAULT_LIMIT = 60;
export const GROUPED_LIMIT = 300;
const MODEL_ROWS = 40;
const MODEL_PREVIEW = 25;
/** A finished result up to this size is the answer, so the model sees every row. title_years is 42 rows and used to be cut off at 2019. */
const COMPLETE_ROWS = 80;

export const TABLE_COLUMNS: Record<TableName, Record<string, { type: ColumnType; about: string }>> = {
  team_games: {
    season: { type: 'number', about: 'Season year, 2002 to 2026 (2026 is in progress)' },
    league: { type: 'string', about: 'The competition: Combined, Premier, Championship, League One, or JFFL. Every JFFL Cup game has league JFFL, whichever leagues the managers play in. Use teamLeague for a manager\'s league that season.' },
    type: { type: 'string', about: 'Season (regular season), Cup, or Superbowl' },
    round: { type: 'string', about: 'Week number for Season games. Cup rounds are labels such as 1, 2, 3, 4, or 5-Final.' },
    week: { type: 'number', about: 'Scheduled week. For a regular-season game, the calendar week. For a cup tie, the first week of that round: league cup rounds 1, 2, 3, and 4 are weeks 2, 5, 8, and 11, and JFFL Cup rounds 1 through 5 are weeks 3, 6, 9, 12, and 15. Null only for the Superbowl. Filter type Season when a question is about the league game alone.' },
    lastWeek: { type: 'number', about: 'Last scheduled week of the tie. Same as week for a regular-season game and a league cup. The next week for a JFFL Cup tie, because those scores cover two weeks. Null for the Superbowl.' },
    gameId: { type: 'string', about: 'Same value on both sides of one game. count counts team-rows, so each game is counted twice. Use count_distinct on gameId for the number of matchups.' },
    team: { type: 'string', about: 'Manager nickname for this side of the game' },
    teamLeague: { type: 'string', about: 'League this manager played in that season. Null when that season row is missing. This is the column for "which league was this team in."' },
    opponent: { type: 'string', about: 'Opposing manager nickname' },
    opponentLeague: { type: 'string', about: 'League the opponent played in that season. Null when that season row is missing.' },
    crossLeague: { type: 'number', about: '1 when teamLeague and opponentLeague differ, 0 when they are the same league, null when either league is unknown. Filter crossLeague = 1 to keep inter-league matchups only.' },
    teamFinish: { type: 'number', about: 'This manager\'s final regular-season rank that year, 1 best. Null when unknown, including 2026 until the season ends. Not the rank during the week of the game.' },
    opponentFinish: { type: 'number', about: 'Opponent\'s final regular-season rank that year, 1 best. Null when unknown. Compare it with teamFinish only inside one league (crossLeague 0).' },
    betterFinish: { type: 'number', about: '1 when this manager finished the regular season ahead of the opponent in the same league, 0 when behind. Null when the leagues differ, the finishes are equal, or either finish is unknown.' },
    score: { type: 'number', about: 'This side\u2019s score (null if ESPN has not reported it yet)' },
    opponentScore: { type: 'number', about: 'Opponent score' },
    diff: { type: 'number', about: 'score minus opponentScore (negative means a loss)' },
    margin: { type: 'number', about: 'Absolute score difference' },
    result: { type: 'string', about: 'W, L, or T. For a live game this is the current state, not a result' },
    win: { type: 'number', about: '1 if this side won, otherwise 0' },
    loss: { type: 'number', about: '1 if this side lost, otherwise 0' },
    tie: { type: 'number', about: '1 if tied, otherwise 0' },
    winStreak: { type: 'number', about: 'Consecutive regular-season wins ending with this game, inside this season only. A loss or tie resets it to 0. Null on cup and Superbowl games, on games still being played, and when the weekly log does not match the season record (including 2002).' },
    lossStreak: { type: 'number', about: 'Consecutive regular-season losses ending with this game, inside this season only. A win or tie resets it to 0. Null in the same cases as winStreak.' },
    twoWeekCup: { type: 'number', about: '1 for JFFL Cup games, whose scores are two-week totals and are not comparable to a single week' },
    status: { type: 'string', about: 'final, or live for a 2026 game still being played (its score can change)' },
  },
  seasons: {
    season: { type: 'number', about: 'Season year, 2002 to 2026 (2026 is in progress)' },
    team: { type: 'string', about: 'Manager nickname' },
    league: { type: 'string', about: 'League that manager played in that year' },
    rankSeason: { type: 'number', about: 'Regular-season finish in the league, 1 is best. Null for 2026 until week 14 is final' },
    standing: { type: 'number', about: 'Current league position, 1 is first. Equals rankSeason for finished seasons. This is the number to put in front of a name when the sentence is about the league table or a league matchup.' },
    rankFinal: { type: 'number', about: 'Superbowl finish, 1 is champion' },
    jfflRank: { type: 'number', about: 'JFFL Cup finish, 1 is champion (2013 onward)' },
    cupRank: { type: 'number', about: 'League cup finish, 1 is champion' },
    jfflSeed: { type: 'number', about: '2026 JFFL Cup seed, 1 is the top seed. Seeds 1 and 2 have a first-round bye. Null in every season before 2026. Not the current league standing, and not a random draw.' },
    leagueCupSeed: { type: 'number', about: '2026 seed in that manager\'s own league cup, 1 is the top seed. Seeds 1 through 6 have a first-round bye. Null before 2026. Not the JFFL Cup seed and not the current league standing. The standings page Start Δ is this seed minus standing.' },
    club: { type: 'string', about: 'ESPN team name for 2026, such as the name under the manager on the standings page. Null before 2026.' },
    previousRank: { type: 'number', about: 'League rank after the previous completed week. Null before 2026. Week Δ on the standings page is previousRank minus standing.' },
    week2Rank: { type: 'number', about: 'Starting rank from the 2026 Week 2 commissioner sheet. Null before 2026. This is not the Start Δ and not the draft slot.' },
    zone: { type: 'string', about: 'Provisional promotion or relegation band for the current 2026 rank: Premier safety zone, Relegation zone, Premier promotion zone, Championship safety zone, Championship promotion zone, or League One. Null before 2026. Trophy exceptions can still change the final allocation.' },
    points: { type: 'number', about: 'Total regular-season points scored (2026: so far). This is the official total; do not rebuild it by summing games.' },
    pointsAgainst: { type: 'number', about: 'Points allowed. For 2026 this is the ESPN points against on the standings page. For earlier seasons it is filled only when the weekly log matches the season record, and it is null otherwise, including every 2002 season. Never treat that null as zero.' },
    pointsPerWeek: { type: 'number', about: 'Average points per week' },
    wins: { type: 'number', about: 'Regular-season wins' },
    losses: { type: 'number', about: 'Regular-season losses' },
    ties: { type: 'number', about: 'Regular-season ties' },
    draft: { type: 'number', about: 'Draft slot, 1 picks first. For 2026 this is the ESPN draft rank, or the commissioner sheet when ESPN has none. Draft Δ is this number minus standing.' },
    pointsRank: { type: 'number', about: 'Rank by points scored within the league' },
    seasonChamp: { type: 'number', about: '1 if finished first in the regular season, 0 if not, null if unknown' },
    superBowlChamp: { type: 'number', about: '1 if won the league Superbowl, 0 if not, null if unknown' },
    leagueCupChamp: { type: 'number', about: '1 if won the league cup, 0 if not, null if unknown' },
    jfflCupChamp: { type: 'number', about: '1 if won the JFFL Cup, 0 if not, null if unknown' },
    topThree: { type: 'number', about: '1 if the regular-season finish was 1 to 3, 0 if not, null if unknown' },
    status: { type: 'string', about: 'final, or live for the 2026 season still in progress' },
  },
  player_weeks: {
    season: { type: 'number', about: 'Season year. Player data exists only for 2026' },
    league: { type: 'string', about: 'Premier, Championship, or League One' },
    week: { type: 'number', about: 'Week number' },
    team: { type: 'string', about: 'Manager nickname whose roster the player was on' },
    player: { type: 'string', about: 'Player name' },
    position: { type: 'string', about: 'QB, RB, WR, TE, K, D/ST, and so on' },
    proTeam: { type: 'string', about: 'NFL team abbreviation' },
    slot: { type: 'string', about: 'Lineup slot such as QB, RB, FLEX, BE (bench), or IR. Null when the slot for that week is unknown' },
    starter: { type: 'number', about: '1 if in the starting lineup, 0 if on the bench or IR, null if unknown' },
    points: { type: 'number', about: 'Fantasy points that week (null if not reported)' },
    projected: { type: 'number', about: 'ESPN projection for the current week only. Null on an earlier week and when ESPN has not sent one.' },
    seasonPoints: { type: 'number', about: 'Fantasy points for the season so far, from the current roster. Null on an earlier week.' },
    averagePoints: { type: 'number', about: 'Average fantasy points, from the current roster. Null on an earlier week.' },
    injury: { type: 'string', about: 'Injury report on the current roster, such as Questionable or Out. Null when healthy or on an earlier week.' },
    status: { type: 'string', about: 'final, or live while that week is still being played' },
  },
};

export const DATA_NOTES = [
  'Seasons 2002 through 2025 are complete history. 2026 is in progress and comes from the live league snapshots, when they are loaded.',
  'Rows with status live are games still being played. Their scores can change. Records and "best ever" questions should use status final.',
  '2026 titles stay unknown (null) until they are decided. Player-level data (player_weeks) exists only for 2026.',
  '2002 has standings and Superbowl results but almost no weekly game scores.',
  'JFFL Cup games (league JFFL, 2013 onward) use two-week totals. Do not compare those scores with a single week. league on those games is always JFFL; teamLeague and opponentLeague say which league each manager played in, and crossLeague is 1 when those leagues differ.',
  'Cup rows carry the scheduled week of that round, the same calendar since 2013. League cups: round 1 week 2, round 2 week 5, round 3 week 8, round 4 week 11. JFFL Cup: rounds 1 to 5 are weeks 3–4, 6–7, 9–10, 12–13, and 15–16. A same-week double, two managers meeting in both the league game and the cup, is double_duty. A level replay is the following week and is not a separate row before 2026.',
  'Ties are separate from wins and losses.',
  'Names are manager nicknames. "team" always means the manager.',
  '2026 cups are seeded. jfflSeed is the JFFL Cup seed and leagueCupSeed is the seed in that manager\'s league cup. Both are null before 2026, so those seasons have no cup seeds. A seed is not the current standing.',
  '2026 season rows also carry the standings page: club, previousRank, week2Rank, draft, zone, and ESPN pointsAgainst. Those fields are null before 2026. Scoring settings, trophy-room profiles, could-have lineups, and player counting stats are separate tools.',
  'Wins, losses, ties, and points on a season row are the official regular-season totals. teamFinish is the final regular-season rank that year, not the rank at the time of a game, and it only compares with another finish inside the same league. Before 2026, pointsAgainst is null when the weekly log does not match the season record. For 2026 it is the ESPN points against on the standings page. winStreak and lossStreak count consecutive regular-season results inside one season; a tie resets both, and they do not cross seasons or include cup games.',
];

const TABLE_INTRO: Record<TableName, string> = {
  team_games: 'team_games (query_games): one row per team per game, so every game appears twice',
  seasons: 'seasons (query_seasons): one row per manager per season',
  player_weeks: 'player_weeks (query_players): one row per rostered player per week, 2026 only',
};

export function schemaDoc() {
  const lines: string[] = [];
  for (const table of TABLES) {
    lines.push(`Table ${TABLE_INTRO[table]}:`);
    for (const [name, info] of Object.entries(TABLE_COLUMNS[table])) lines.push(`- ${name} (${info.type}): ${info.about}`);
  }
  return lines.join('\n');
}

type GameLike = Omit<HistoryGame, 'scoreA' | 'scoreB'> & { scoreA: number | null; scoreB: number | null; status?: string };

/** Points allowed, only when the weekly log reproduces that season's official record. */
function pointsAllowed(log: { wins: number; losses: number; ties: number; against: number } | undefined, row: HistorySeason) {
  if (!log || row.wins == null || row.losses == null || row.ties == null) return null;
  return log.wins === row.wins && log.losses === row.losses && log.ties === row.ties ? log.against : null;
}

/** Running result streaks, in game order. A tie resets both. */
export function streakLengths(results: Array<'W' | 'L' | 'T'>): Array<{ winStreak: number; lossStreak: number }> {
  let wins = 0;
  let losses = 0;
  return results.map(result => {
    if (result === 'W') { wins += 1; losses = 0; }
    else if (result === 'L') { losses += 1; wins = 0; }
    else { wins = 0; losses = 0; }
    return { winStreak: wins, lossStreak: losses };
  });
}

/** Scheduled weeks for a cup round. League cups are one week; the JFFL Cup is the two-week window. */
export function cupWindow(league: string, round: string): number[] | null {
  if (league === 'JFFL') {
    const windows: Record<string, number[]> = { '1': [3, 4], '2': [6, 7], '3': [9, 10], '4': [12, 13], '5': [15, 16], '5-Final': [15, 16] };
    return windows[round] ?? null;
  }
  const weeks: Record<string, number[]> = { '1': [2], '2': [5], '3': [8], '4': [11], '4-Final': [11] };
  return weeks[round] ?? null;
}

export function prepareTables(archive: Archive): Record<TableName, Row[]> {
  const seasonOf = new Map<string, { league: string; finish: number | null }>();
  for (const row of [...archive.seasons, ...(archive.live?.seasons ?? [])]) seasonOf.set(`${row.season}|${row.team}`, { league: row.league, finish: row.rankSeason });
  const teamGames: Row[] = [];
  const carried = (archive.saved ?? []).flatMap(item => finishedGames(item));
  const present = new Set([...archive.games, ...(archive.live?.games ?? [])].map(game => `${game.season}|${game.league}|${game.type}|${game.week ?? ''}|${game.round}|${[game.teamA, game.teamB].sort().join('|')}`));
  const games: GameLike[] = [...archive.games, ...carried.filter(game => !present.has(`${game.season}|${game.league}|${game.type}|${game.week ?? ''}|${game.round}|${[game.teamA, game.teamB].sort().join('|')}`)), ...(archive.live?.games ?? [])];
  const scored = new Map<string, { wins: number; losses: number; ties: number; against: number }>();
  for (const game of games) {
    const twoWeek = game.type === 'Cup' && game.league === 'JFFL' ? 1 : 0;
    const status = game.status ?? 'final';
    const gameId = `${game.season}|${game.league}|${game.type}|${game.round}|${[game.teamA, game.teamB].sort().join('|')}`;
    if (game.type === 'Season' && status === 'final' && game.scoreA != null && game.scoreB != null) {
      const bump = (team: string, score: number, other: number) => {
        const key = `${game.season}|${team}`;
        const tally = scored.get(key) ?? { wins: 0, losses: 0, ties: 0, against: 0 };
        if (score > other) tally.wins += 1; else if (score < other) tally.losses += 1; else tally.ties += 1;
        tally.against += other;
        scored.set(key, tally);
      };
      bump(game.teamA, game.scoreA, game.scoreB);
      bump(game.teamB, game.scoreB, game.scoreA);
    }
    const side = (team: string, opponent: string, score: number | null, other: number | null): Row => {
      const known = score !== null && other !== null;
      const teamInfo = seasonOf.get(`${game.season}|${team}`);
      const opponentInfo = seasonOf.get(`${game.season}|${opponent}`);
      const teamLeague = teamInfo?.league ?? null;
      const opponentLeague = opponentInfo?.league ?? null;
      const teamFinish = teamInfo?.finish ?? null;
      const opponentFinish = opponentInfo?.finish ?? null;
      const crossLeague = teamLeague && opponentLeague ? teamLeague === opponentLeague ? 0 : 1 : null;
      const betterFinish = crossLeague === 0 && teamFinish != null && opponentFinish != null && teamFinish !== opponentFinish ? teamFinish < opponentFinish ? 1 : 0 : null;
      const scheduled = game.type === 'Cup' ? cupWindow(game.league, game.round) : null;
      const week = game.type === 'Season' ? game.week : scheduled?.[0] ?? null;
      const lastWeek = game.type === 'Season' ? game.week : scheduled ? scheduled[scheduled.length - 1] : null;
      return {
        season: game.season, league: game.league, type: game.type, round: game.round, week, lastWeek, gameId,
        team, teamLeague, opponent, opponentLeague, crossLeague, teamFinish, opponentFinish, betterFinish, score, opponentScore: other,
        diff: known ? score - other : null, margin: known ? Math.abs(score - other) : null,
        result: known ? score > other ? 'W' : score < other ? 'L' : 'T' : null,
        win: known ? score > other ? 1 : 0 : null, loss: known ? score < other ? 1 : 0 : null, tie: known ? score === other ? 1 : 0 : null,
        winStreak: null, lossStreak: null, twoWeekCup: twoWeek, status,
      };
    };
    teamGames.push(side(game.teamA, game.teamB, game.scoreA, game.scoreB), side(game.teamB, game.teamA, game.scoreB, game.scoreA));
  }
  const streakEligible = new Set<string>();
  for (const row of [...archive.seasons, ...(archive.live?.seasons ?? [])]) {
    if (pointsAllowed(scored.get(`${row.season}|${row.team}`), row) != null) streakEligible.add(`${row.season}|${row.team}`);
  }
  const streakGroups = new Map<string, Row[]>();
  for (const row of teamGames) {
    if (row.type !== 'Season' || row.status !== 'final' || row.week == null || (row.result !== 'W' && row.result !== 'L' && row.result !== 'T')) continue;
    const key = `${row.season}|${row.team}`;
    if (!streakEligible.has(key)) continue;
    const list = streakGroups.get(key) ?? [];
    list.push(row);
    streakGroups.set(key, list);
  }
  for (const list of streakGroups.values()) {
    list.sort((left, right) => (left.week as number) - (right.week as number));
    const streaks = streakLengths(list.map(row => row.result as 'W' | 'L' | 'T'));
    list.forEach((row, index) => Object.assign(row, streaks[index]));
  }
  const flag = (rank: number | null, test: (value: number) => boolean) => rank == null ? null : test(rank) ? 1 : 0;
  const seasonRow = (row: HistorySeason & { standing?: number | null; jfflSeed?: number | null; leagueCupSeed?: number | null; club?: string | null; previousRank?: number | null; week2Rank?: number | null; zone?: string | null; snapshotPointsAgainst?: number | null }, status: string): Row => ({
    season: row.season, team: row.team, league: row.league,
    rankSeason: row.rankSeason, standing: row.standing === undefined ? row.rankSeason : row.standing,
    rankFinal: row.rankFinal, jfflRank: row.jfflRank, cupRank: row.cupRank,
    jfflSeed: row.jfflSeed ?? null, leagueCupSeed: row.leagueCupSeed ?? null,
    club: row.club ?? null, previousRank: row.previousRank ?? null, week2Rank: row.week2Rank ?? null, zone: row.zone ?? null,
    points: row.points, pointsPerWeek: row.pointsPerWeek,
    pointsAgainst: row.snapshotPointsAgainst !== undefined ? row.snapshotPointsAgainst ?? null : pointsAllowed(scored.get(`${row.season}|${row.team}`), row),
    wins: row.wins, losses: row.losses, ties: row.ties,
    draft: row.draft, pointsRank: row.pointsRank,
    seasonChamp: flag(row.rankSeason, value => value === 1),
    superBowlChamp: flag(row.rankFinal, value => value === 1),
    leagueCupChamp: flag(row.cupRank, value => value === 1),
    jfflCupChamp: flag(row.jfflRank, value => value === 1),
    topThree: flag(row.rankSeason, value => value <= 3),
    status,
  });
  const seasons: Row[] = [
    ...archive.seasons.map(row => seasonRow(row, 'final')),
    ...(archive.live?.seasons ?? []).map(row => seasonRow(row, 'live')),
  ];
  const players: Row[] = (archive.live?.players ?? []).map(row => ({ ...row }));
  return { team_games: teamGames, seasons, player_weeks: players };
}

/** All seasons including saved years and the in-progress one. Undecided ranks stay null. */
const allSeasons = (archive: Archive): HistorySeason[] => playedArchive(archive).seasons;
/** Workbook games, saved seasons, and finished games from the season in progress. Live games are never counted as results. */
const resultGames = (archive: Archive): HistoryGame[] => playedArchive(archive).games;
export const lastSeason = (archive: Archive) => archive.live?.season ?? 2025;

export function asOfLabel(asOf: string | null | undefined) {
  if (!asOf) return 'the latest snapshot';
  const date = new Date(asOf);
  return Number.isNaN(date.getTime()) ? 'the latest snapshot' : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

// ---------- Query parsing ----------

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const columnList = (table: TableName) => Object.keys(TABLE_COLUMNS[table]).join(', ');

function parseFilter(table: TableName, raw: unknown, label: string): Parsed<Filter> {
  if (!isObject(raw)) return fail(`${label} must be an object with field, op and value.`);
  const field = String(raw.field ?? '');
  const column = TABLE_COLUMNS[table][field];
  if (!column) return fail(`${label}: unknown field "${field}". Valid fields for ${table}: ${columnList(table)}.`);
  const op = String(raw.op ?? 'eq') as FilterOp;
  if (!FILTER_OPS.includes(op)) return fail(`${label}: unknown op "${op}". Use one of ${FILTER_OPS.join(', ')}.`);
  if (op === 'is_null' || op === 'not_null') return { ok: true, value: { field, op } };
  let values: Array<string | number>;
  if (Array.isArray(raw.value)) values = raw.value.map(item => typeof item === 'number' ? item : String(item));
  else if (raw.value === undefined || raw.value === null || raw.value === '') return fail(`${label}: op ${op} needs a value.`);
  else if (typeof raw.value === 'number') values = [raw.value];
  else values = (op === 'in' || op === 'between') ? String(raw.value).split(',').map(item => item.trim()).filter(Boolean) : [String(raw.value)];
  if (column.type === 'number' && op !== 'contains') {
    const numbers = values.map(Number);
    if (numbers.some(number => !Number.isFinite(number))) return fail(`${label}: field "${field}" is numeric, but the value is not a number.`);
    values = numbers;
  }
  if (op === 'between' && values.length !== 2) return fail(`${label}: between needs exactly two values, for example "2013,2025".`);
  if (op !== 'in' && op !== 'between' && values.length !== 1) return fail(`${label}: op ${op} takes a single value.`);
  if (values.length > 60) return fail(`${label}: too many values.`);
  return { ok: true, value: { field, op, value: op === 'in' || op === 'between' ? values as string[] | number[] : values[0] } };
}

export function parseQuery(table: TableName, raw: unknown): Parsed<Query> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (!isObject(raw)) return fail('The query must be an object.');
  const query: Query = {};
  const filters = (value: unknown, label: string, max: number): Parsed<Filter[]> => {
    if (value === undefined || value === null) return { ok: true, value: [] };
    if (!Array.isArray(value)) return fail(`${label} must be an array.`);
    if (value.length > max) return fail(`${label} has too many entries.`);
    const parsed: Filter[] = [];
    for (const [index, item] of value.entries()) {
      const result = parseFilter(table, item, `${label}[${index}]`);
      if (!result.ok) return result;
      parsed.push(result.value);
    }
    return { ok: true, value: parsed };
  };
  const base = filters(raw.filters, 'filters', 14);
  if (!base.ok) return base;
  if (base.value.length) query.filters = base.value;
  const fields = (value: unknown, label: string, max: number): Parsed<string[]> => {
    if (value === undefined || value === null) return { ok: true, value: [] };
    if (!Array.isArray(value) || value.length > max) return fail(`${label} must be an array of at most ${max} field names.`);
    return { ok: true, value: value.map(String) };
  };
  if (raw.within !== undefined && raw.within !== null) {
    if (!isObject(raw.within)) return fail('within must be an object with groupBy, fn and field.');
    const buckets = fields(raw.within.groupBy, 'within.groupBy', 4);
    if (!buckets.ok) return buckets;
    if (!buckets.value.length) return fail('within.groupBy needs at least one field.');
    for (const field of buckets.value) if (!TABLE_COLUMNS[table][field]) return fail(`within.groupBy: unknown field "${field}". Valid fields for ${table}: ${columnList(table)}.`);
    const fn = String(raw.within.fn ?? '');
    if (fn !== 'min' && fn !== 'max') return fail('within.fn must be "min" or "max".');
    const field = String(raw.within.field ?? '');
    const column = TABLE_COLUMNS[table][field];
    if (!column) return fail(`within.field: unknown field "${field}". Valid fields for ${table}: ${columnList(table)}.`);
    if (column.type !== 'number') return fail(`within.field: "${field}" must be numeric.`);
    query.within = { groupBy: buckets.value, fn, field };
  }
  const group = fields(raw.groupBy, 'groupBy', 4);
  if (!group.ok) return group;
  for (const field of group.value) if (!TABLE_COLUMNS[table][field]) return fail(`groupBy: unknown field "${field}". Valid fields for ${table}: ${columnList(table)}.`);
  if (group.value.length) query.groupBy = group.value;
  const select = fields(raw.select, 'select', 24);
  if (!select.ok) return select;
  for (const field of select.value) if (!TABLE_COLUMNS[table][field]) return fail(`select: unknown field "${field}". Valid fields for ${table}: ${columnList(table)}.`);
  if (select.value.length) query.select = select.value;
  if (raw.aggregates !== undefined && raw.aggregates !== null) {
    if (!Array.isArray(raw.aggregates) || raw.aggregates.length > 8) return fail('aggregates must be an array of at most 8 items.');
    query.aggregates = [];
    for (const [index, item] of raw.aggregates.entries()) {
      if (!isObject(item)) return fail(`aggregates[${index}] must be an object.`);
      const fn = String(item.fn ?? '') as AggFn;
      if (!AGG_FUNCTIONS.includes(fn)) return fail(`aggregates[${index}]: unknown fn "${fn}". Use one of ${AGG_FUNCTIONS.join(', ')}.`);
      const field = item.field === undefined || item.field === null || item.field === '' ? undefined : String(item.field);
      if (field && !TABLE_COLUMNS[table][field]) return fail(`aggregates[${index}]: unknown field "${field}". Valid fields for ${table}: ${columnList(table)}.`);
      if (!field && !['count', 'rate'].includes(fn)) return fail(`aggregates[${index}]: ${fn} needs a field.`);
      if (field && ['sum', 'mean', 'median'].includes(fn) && TABLE_COLUMNS[table][field].type !== 'number') return fail(`aggregates[${index}]: ${fn} needs a numeric field.`);
      const when = filters(item.when, `aggregates[${index}].when`, 6);
      if (!when.ok) return when;
      if (fn === 'rate' && !when.value.length) return fail(`aggregates[${index}]: rate needs a "when" filter. It returns the percent of rows matching it.`);
      const name = item.as === undefined || item.as === null || item.as === '' ? undefined : String(item.as);
      if (name && !/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(name)) return fail(`aggregates[${index}]: "as" must be a simple name.`);
      query.aggregates.push({ fn, ...(field ? { field } : {}), ...(name ? { as: name } : {}), ...(when.value.length ? { when: when.value } : {}) });
    }
  }
  if (raw.sort !== undefined && raw.sort !== null) {
    if (!Array.isArray(raw.sort) || raw.sort.length > 6) return fail('sort must be an array of at most 6 items.');
    query.sort = raw.sort.map(item => {
      const entry = isObject(item) ? item : { field: String(item) };
      return { field: String(entry.field ?? ''), dir: entry.dir === 'desc' ? 'desc' as const : 'asc' as const };
    });
  }
  if (raw.limit !== undefined && raw.limit !== null) {
    const limit = Number(raw.limit);
    if (!Number.isFinite(limit) || limit < 1) return fail('limit must be a positive number.');
    query.limit = Math.min(MAX_ROWS, Math.floor(limit));
  }
  return { ok: true, value: query };
}

// ---------- Query execution ----------

function matches(row: Row, filter: Filter): boolean {
  const cell = row[filter.field];
  if (filter.op === 'is_null') return cell === null || cell === undefined;
  if (filter.op === 'not_null') return cell !== null && cell !== undefined;
  if (cell === null || cell === undefined) return false;
  const text = (value: unknown) => String(value).toLowerCase();
  const value = filter.value;
  switch (filter.op) {
    case 'eq': return typeof cell === 'number' ? cell === Number(value) : text(cell) === text(value);
    case 'ne': return typeof cell === 'number' ? cell !== Number(value) : text(cell) !== text(value);
    case 'gt': return Number(cell) > Number(value);
    case 'gte': return Number(cell) >= Number(value);
    case 'lt': return Number(cell) < Number(value);
    case 'lte': return Number(cell) <= Number(value);
    case 'in': return (value as Array<string | number>).some(item => typeof cell === 'number' ? Number(item) === cell : text(item) === text(cell));
    case 'between': { const [low, high] = (value as number[]).map(Number); return Number(cell) >= low && Number(cell) <= high; }
    case 'contains': return text(cell).includes(text(value));
    default: return false;
  }
}

const roundTo = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

function aggregate(rows: Row[], spec: Aggregate): Cell {
  const scope = spec.when && spec.fn !== 'rate' ? rows.filter(row => spec.when!.every(filter => matches(row, filter))) : rows;
  if (spec.fn === 'count') return spec.field ? scope.filter(row => row[spec.field!] != null).length : scope.length;
  if (spec.fn === 'rate') {
    if (!rows.length) return null;
    const hit = rows.filter(row => spec.when!.every(filter => matches(row, filter))).length;
    return rate(hit, rows.length);
  }
  const values = scope.map(row => row[spec.field!]).filter(cell => cell !== null && cell !== undefined);
  if (spec.fn === 'count_distinct') return new Set(values.map(String)).size;
  if (!values.length) return null;
  if (spec.fn === 'min' || spec.fn === 'max') {
    const numeric = values.every(cell => typeof cell === 'number');
    const sorted = [...values].sort((a, b) => numeric ? (a as number) - (b as number) : String(a).localeCompare(String(b)));
    return spec.fn === 'min' ? sorted[0] : sorted[sorted.length - 1];
  }
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  if (spec.fn === 'sum') return roundTo(numbers.reduce((sum, value) => sum + value, 0), 2);
  if (spec.fn === 'mean') return roundTo(numbers.reduce((sum, value) => sum + value, 0) / numbers.length, 2);
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return roundTo(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2, 2);
}

export const aggregateName = (spec: Aggregate) => spec.as ?? (spec.field ? `${spec.fn}_${spec.field}` : spec.fn);

function inferColumns(names: string[], rows: Row[], table?: TableName): Column[] {
  return names.map(name => {
    const declared = table ? TABLE_COLUMNS[table][name]?.type : undefined;
    if (declared) return { name, type: declared };
    const sample = rows.map(row => row[name]).filter(cell => cell !== null && cell !== undefined);
    return { name, type: sample.length && sample.every(cell => typeof cell === 'number') ? 'number' : 'string' };
  });
}

const compareCells = (a: Cell, b: Cell) => {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
};

export interface QueryResult {
  columns: Column[];
  rows: Row[];
  matched: number;
  truncated: boolean;
  caveats: string[];
}

const SCORE_FIELDS = new Set(['score', 'opponentScore', 'diff', 'margin']);

function keepExtremes(rows: Row[], within: Within): Row[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = JSON.stringify(within.groupBy.map(field => row[field] ?? null));
    const bucket = groups.get(key);
    if (bucket) bucket.push(row); else groups.set(key, [row]);
  }
  const kept: Row[] = [];
  for (const bucket of groups.values()) {
    const values = bucket.map(row => row[within.field]).filter((cell): cell is number => typeof cell === 'number');
    if (!values.length) continue;
    const extreme = within.fn === 'min' ? Math.min(...values) : Math.max(...values);
    for (const row of bucket) if (row[within.field] === extreme) kept.push(row);
  }
  return kept;
}

export const liveCaveat = (asOf: string | null | undefined) => `Includes live scores as of ${asOfLabel(asOf)}. They can change.`;
export const IN_PROGRESS_CAVEAT = '2026 is in progress. Its totals cover games played so far, and its titles stay unknown until decided.';
const UNKNOWN_SLOT_CAVEAT = 'Rows with starter null are past weeks where the player was not in that team\u2019s saved starting lineup. The player may have been on the bench or on another roster that week.';

export function runQuery(tables: Record<TableName, Row[]>, table: TableName, query: Query, asOf?: string | null): Parsed<QueryResult> {
  let filtered = (query.filters ?? []).length ? tables[table].filter(row => query.filters!.every(filter => matches(row, filter))) : tables[table];
  let withinNote: string | undefined;
  if (query.within) {
    const before = filtered.length;
    filtered = keepExtremes(filtered, query.within);
    withinNote = `Kept ${filtered.length} of ${before} rows at the ${query.within.fn} ${query.within.field} within each ${query.within.groupBy.join(', ')}. Ties are included.`;
  }
  const used = new Set<string>([
    ...(query.select ?? []), ...(query.groupBy ?? []),
    ...(query.aggregates ?? []).flatMap(item => item.field ? [item.field] : []),
    ...(query.sort ?? []).map(item => item.field),
    ...(query.within ? [query.within.field, ...query.within.groupBy] : []),
  ]);
  let names: string[];
  let rows: Row[];
  if (query.groupBy?.length || query.aggregates?.length) {
    const groupBy = query.groupBy ?? [];
    const specs: Aggregate[] = query.aggregates?.length ? query.aggregates : [{ fn: 'count' }];
    const groups = new Map<string, Row[]>();
    for (const row of filtered) {
      const key = JSON.stringify(groupBy.map(field => row[field]));
      const bucket = groups.get(key);
      if (bucket) bucket.push(row); else groups.set(key, [row]);
    }
    if (!groupBy.length && !groups.size) groups.set('[]', []);
    names = [...groupBy, ...specs.map(aggregateName)];
    rows = [...groups.values()].map(bucket => {
      const out: Row = {};
      for (const field of groupBy) out[field] = bucket[0]?.[field] ?? null;
      for (const spec of specs) out[aggregateName(spec)] = aggregate(bucket, spec);
      return out;
    });
  } else {
    names = query.select?.length ? query.select : Object.keys(TABLE_COLUMNS[table]);
    rows = filtered.map(row => Object.fromEntries(names.map(name => [name, row[name] ?? null])));
  }
  for (const sort of query.sort ?? []) if (!names.includes(sort.field)) return fail(`sort: "${sort.field}" is not a column of the result. Result columns: ${names.join(', ')}.`);
  if (query.sort?.length) {
    rows = [...rows].sort((a, b) => {
      for (const sort of query.sort!) {
        const result = compareCells(a[sort.field], b[sort.field]);
        if (result) return sort.dir === 'desc' ? (a[sort.field] === null || b[sort.field] === null ? result : -result) : result;
      }
      return 0;
    });
  } else if (!query.groupBy?.length && !query.aggregates?.length) {
    // Stable, readable default order for raw rows.
    rows = [...rows].sort((a, b) => compareCells(a.season, b.season) || compareCells(a.week, b.week));
  } else {
    const groupBy = query.groupBy ?? [];
    if (groupBy.length) rows = [...rows].sort((a, b) => groupBy.reduce((result, field) => result || compareCells(a[field], b[field]), 0));
  }
  const grouped = !!(query.groupBy?.length || query.aggregates?.length);
  const limit = Math.min(query.limit ?? (grouped ? GROUPED_LIMIT : DEFAULT_LIMIT), MAX_ROWS);
  const truncated = rows.length > limit;
  const caveats: string[] = [];
  if (withinNote) caveats.push(withinNote);
  if (table === 'team_games') {
    const scoreUsed = [...used].some(field => SCORE_FIELDS.has(field));
    if (scoreUsed && filtered.some(row => row.twoWeekCup === 1)) caveats.push('Includes JFFL Cup games, whose scores are two-week totals. Filter twoWeekCup = 0 or type = Season for single-week scores.');
    if (filtered.some(row => row.season === 2002)) caveats.push('2002 has almost no weekly game scores.');
  }
  if (filtered.some(row => row.status === 'live')) caveats.push(table === 'seasons' ? IN_PROGRESS_CAVEAT : liveCaveat(asOf));
  if (table === 'player_weeks' && filtered.some(row => row.starter === null)) caveats.push(UNKNOWN_SLOT_CAVEAT);
  if (filtered.length === 0) caveats.push('No rows matched the filters.');
  if (truncated) caveats.push(`Showing the first ${limit} of ${rows.length} rows.`);
  for (const spec of query.aggregates ?? []) {
    if (!spec.field || spec.fn === 'count' || spec.fn === 'count_distinct' || spec.fn === 'rate') continue;
    const skipped = filtered.filter(row => row[spec.field!] == null).length;
    if (skipped) caveats.push(`${skipped} rows have no ${spec.field} and are left out of ${aggregateName(spec)}.`);
  }
  const kept = rows.slice(0, limit);
  return { ok: true, value: { columns: inferColumns(names, kept, query.groupBy?.length || query.aggregates?.length ? undefined : table), rows: kept, matched: filtered.length, truncated, caveats } };
}

// ---------- Live controls (re-run a stored query locally) ----------

export interface Controls {
  from?: number;
  to?: number;
  leagues?: string[];
  types?: string[];
  excludeTwoWeek?: boolean;
}

export function applyControls(table: TableName, query: Query, controls: Controls): Query {
  const extra: Filter[] = [];
  if (controls.from !== undefined) extra.push({ field: 'season', op: 'gte', value: controls.from });
  if (controls.to !== undefined) extra.push({ field: 'season', op: 'lte', value: controls.to });
  if (controls.leagues?.length) extra.push({ field: 'league', op: 'in', value: controls.leagues });
  if (table === 'team_games') {
    if (controls.types?.length) extra.push({ field: 'type', op: 'in', value: controls.types });
    if (controls.excludeTwoWeek) extra.push({ field: 'twoWeekCup', op: 'eq', value: 0 });
  }
  return extra.length ? { ...query, filters: [...(query.filters ?? []), ...extra] } : query;
}

// ---------- Entities ----------

function distance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[b.length];
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface EntityMatch { name: string; seasons: number; first: number; last: number; score: number }

/** Every manager with their season span, counting the in-progress season. */
function managerList(archive: Archive): Array<{ team: string; seasons: number; first: number; last: number }> {
  const list = new Map(careers(archive.seasons).map(row => [row.team, { team: row.team, seasons: row.seasons, first: row.first, last: row.last }]));
  for (const row of archive.live?.seasons ?? []) {
    const known = list.get(row.team);
    if (!known) list.set(row.team, { team: row.team, seasons: 1, first: row.season, last: row.season });
    else if (row.season > known.last) list.set(row.team, { ...known, seasons: known.seasons + 1, last: row.season });
  }
  return [...list.values()];
}

export const managerNames = (archive: Archive) => managerList(archive).map(row => row.team).sort((a, b) => a.localeCompare(b));

export function resolveEntity(archive: Archive, query: string): { exact: boolean; matches: EntityMatch[] } {
  const wanted = squash(query);
  if (!wanted) return { exact: false, matches: [] };
  const scored = managerList(archive).map(row => {
    const name = squash(row.team);
    let score: number;
    if (name === wanted) score = 0;
    else if (name.startsWith(wanted) || wanted.startsWith(name)) score = 1;
    else if (name.includes(wanted) || wanted.includes(name)) score = 2;
    else {
      const gap = distance(name, wanted);
      score = gap <= 2 && gap < Math.max(name.length, wanted.length) / 2 ? 3 + gap : 99;
    }
    return { name: row.team, seasons: row.seasons, first: row.first, last: row.last, score };
  }).filter(row => row.score < 99).sort((a, b) => a.score - b.score || b.seasons - a.seasons).slice(0, 6);
  return { exact: scored.length > 0 && scored[0].score === 0, matches: scored };
}

// ---------- Tools ----------

export interface ToolContext { archive: Archive; tables: Record<TableName, Row[]> }
export function createContext(archive: Archive): ToolContext { return { archive, tables: prepareTables(archive) }; }

export type ToolOutcome =
  | { ok: true; title: string; columns: Column[]; rows: Row[]; matched: number; truncated: boolean; caveats: string[]; summary?: Record<string, unknown> }
  | { ok: false; error: string }
  | { ok: true; entity: ReturnType<typeof resolveEntity> };

export const DATA_TOOL_NAMES = ['query_games', 'query_seasons', 'query_players', 'resolve_entity', 'head_to_head', 'manager_career', 'records', 'title_years', 'draft_slot_stats', 'week_slice', 'schedule', 'double_duty', 'scoring_settings', 'manager_profiles', 'could_have', 'player_stats'] as const;
export type DataToolName = (typeof DATA_TOOL_NAMES)[number];
export const isDataTool = (name: string): name is DataToolName => (DATA_TOOL_NAMES as readonly string[]).includes(name);

const BOOKS = { weekly: WEEKLY, jffl_cup: JFFL_CUP, league_cup: LEAGUE_CUP, super_bowl: SUPER_BOWL } as const;
const BOOK_LABEL = { weekly: 'Weekly', jffl_cup: 'JFFL Cup', league_cup: 'League cups', super_bowl: 'Superbowl' } as const;

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
};

function managerError(archive: Archive, name: string) {
  const found = resolveEntity(archive, name);
  return found.matches.length
    ? `No manager named "${name}". Closest: ${found.matches.map(match => match.name).join(', ')}.`
    : `No manager named "${name}" in the archive.`;
}

function exactManager(archive: Archive, name: unknown): string | null {
  const wanted = String(name ?? '').trim().toLowerCase();
  return managerList(archive).find(row => row.team.toLowerCase() === wanted)?.team ?? null;
}

function gameRow(game: HistoryGame, perspective?: string): Row {
  const first = perspective && game.teamB === perspective ? { team: game.teamB, opponent: game.teamA, score: game.scoreB, other: game.scoreA } : { team: game.teamA, opponent: game.teamB, score: game.scoreA, other: game.scoreB };
  return {
    season: game.season, league: game.league, when: roundLabel(game), type: game.type,
    team: first.team, opponent: first.opponent, score: first.score, opponentScore: first.other, diff: first.score - first.other,
  };
}

const STAT_ORDER = ['Pass attempts', 'Completions', 'Pass yards', 'Pass TD', 'Interceptions', 'Rush attempts', 'Rush yards', 'Rush TD', 'Receptions', 'Rec yards', 'Rec TD', 'Targets', 'Fumbles', 'Fumbles lost', 'Field goals', 'Extra points', 'Defensive TD', 'Defensive INT', 'Fumble recoveries', 'Safeties', 'Sacks', 'Points allowed', 'Yards allowed'];
const SHORT_LEAGUE: Record<LeagueSlug, string> = { premier: 'Premier', championship: 'Championship', 'league-one': 'League One' };
const foldName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function trophyRoom(manager: string) {
  const person = MANAGERS.find(item => item.manager === manager);
  if (!person) return null;
  return {
    through: 2025,
    league: SHORT_LEAGUE[person.slug],
    seasons: person.seasons,
    trophies: person.trophies,
    trophies2025: person.trophies2025,
    trophies2021: person.trophies2021,
    trophies2013: person.trophies2013,
    finals: person.finals,
    cupRank: person.cupRank || null,
    cupRankLabel: person.cupRank ? String(person.cupRank) : 'Rookie',
    cupAverageFinish: person.cupRank ? person.cupAverageFinish : null,
    cupWins: person.cupWins,
    cupLosses: person.cupLosses,
    cupTitles: person.cupTitles,
    jfflSeed: person.jfflSeed,
    leagueCupSeed: person.leagueSeed,
    week2Rank: person.week2Rank,
    draftRank: person.draftRank,
  };
}

function sameWeekDoubles(archive: Archive): Row[] {
  const meetings = new Map<string, { team: string; opponent: string; leagueScore: number; opponentLeagueScore: number; status: string }>();
  const addSeason = (season: number, week: number | null, teamA: string, teamB: string, scoreA: number | null, scoreB: number | null, status: string) => {
    if (week == null || scoreA == null || scoreB == null) return;
    const [team, opponent] = [teamA, teamB].sort((a, b) => a.localeCompare(b));
    meetings.set(`${season}|${week}|${team}|${opponent}`, {
      team, opponent, status,
      leagueScore: team === teamA ? scoreA : scoreB,
      opponentLeagueScore: team === teamA ? scoreB : scoreA,
    });
  };
  for (const game of archive.games) if (game.type === 'Season') addSeason(game.season, game.week, game.teamA, game.teamB, game.scoreA, game.scoreB, 'final');
  for (const game of archive.live?.games ?? []) if (game.type === 'Season') addSeason(game.season, game.week, game.teamA, game.teamB, game.scoreA, game.scoreB, game.status);
  const rows: Row[] = [];
  const seen = new Set<string>();
  const emit = (season: number, week: number, cup: string, round: string, teamA: string, teamB: string, cupA: number | null, cupB: number | null, cupStatus: string) => {
    const [team, opponent] = [teamA, teamB].sort((a, b) => a.localeCompare(b));
    const meeting = meetings.get(`${season}|${week}|${team}|${opponent}`);
    if (!meeting || cupA == null || cupB == null) return;
    const key = `${season}|${week}|${cup}|${team}|${opponent}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      season, week, cup, round, team, opponent, status: meeting.status === 'live' || cupStatus === 'live' ? 'live' : 'final',
      leagueScore: meeting.leagueScore, opponentLeagueScore: meeting.opponentLeagueScore,
      cupScore: team === teamA ? cupA : cupB, opponentCupScore: team === teamA ? cupB : cupA,
    });
  };
  for (const game of archive.games) {
    if (game.type !== 'Cup') continue;
    for (const week of cupWindow(game.league, game.round) ?? []) emit(game.season, week, game.league, game.round, game.teamA, game.teamB, game.scoreA, game.scoreB, 'final');
  }
  const live = archive.live;
  const summaries = live?.summaries;
  if (live && summaries) {
    const ids: CupId[] = ['jffl', 'premier', 'championship', 'league-one'];
    for (const id of ids) {
      if (id === 'jffl' ? !summaries.premier || !summaries.championship || !summaries['league-one'] : !summaries[id]) continue;
      const cup = buildCup(id, summaries);
      const cupName = id === 'jffl' ? 'JFFL' : id === 'premier' ? 'Premier' : id === 'championship' ? 'Championship' : 'League One';
      cup.rounds.forEach((round, index) => {
        const label = index === cup.rounds.length - 1 ? `${index + 1}-Final` : String(index + 1);
        for (const match of round.matches) {
          const a = match.a.participant;
          const b = match.b.participant;
          if (!a || !b || match.a.total == null || match.b.total == null || !['final', 'tied', 'live'].includes(match.status)) continue;
          for (const week of match.weeks) emit(live.season, week, cupName, label, a.manager, b.manager, match.a.total, match.b.total, match.status === 'live' ? 'live' : 'final');
        }
      });
    }
  }
  return rows.sort((a, b) => (a.season as number) - (b.season as number) || (a.week as number) - (b.week as number) || String(a.cup).localeCompare(String(b.cup)) || String(a.team).localeCompare(String(b.team)));
}

function namedManagers(name: string | null) {
  if (!name) return MANAGERS;
  const folded = foldName(name);
  const exact = MANAGERS.filter(item => foldName(item.manager) === folded);
  return exact.length ? exact : MANAGERS.filter(item => foldName(item.manager).includes(folded));
}

export function runDataTool(ctx: ToolContext, name: DataToolName, args: Record<string, unknown>): ToolOutcome {
  const { archive, tables } = ctx;
  const asOf = archive.live?.asOf;
  const liveNote = archive.live ? [`Includes finished 2026 games through ${asOfLabel(asOf)}. Live games are left out.`] : [];
  switch (name) {
    case 'query_games':
    case 'query_seasons':
    case 'query_players': {
      const table: TableName = name === 'query_games' ? 'team_games' : name === 'query_seasons' ? 'seasons' : 'player_weeks';
      if (table === 'player_weeks' && !tables.player_weeks.length) {
        return fail('Player data is not loaded. It exists only for the 2026 season and comes from the roster snapshots, which are not available right now.');
      }
      const parsed = parseQuery(table, args);
      if (!parsed.ok) return parsed;
      const result = runQuery(tables, table, parsed.value, asOf);
      if (!result.ok) return result;
      return { ok: true, title: table === 'team_games' ? 'Games query' : table === 'seasons' ? 'Seasons query' : 'Players query', ...result.value };
    }
    case 'resolve_entity':
      return { ok: true, entity: resolveEntity(archive, String(args.name ?? '')) };
    case 'head_to_head': {
      const a = exactManager(archive, args.a);
      const b = exactManager(archive, args.b);
      if (!a) return fail(managerError(archive, String(args.a ?? '')));
      if (!b) return fail(managerError(archive, String(args.b ?? '')));
      if (a === b) return fail('Choose two different managers.');
      const finished = resultGames(archive).filter(game => [game.teamA, game.teamB].includes(a) && [game.teamA, game.teamB].includes(b));
      const tally = (list: HistoryGame[]) => {
        let aWins = 0; let bWins = 0; let ties = 0;
        for (const game of list) {
          const aScore = game.teamA === a ? game.scoreA : game.scoreB;
          const bScore = game.teamA === a ? game.scoreB : game.scoreA;
          if (aScore === bScore) ties += 1; else if (aScore > bScore) aWins += 1; else bWins += 1;
        }
        return { meetings: list.length, [`${a}Wins`]: aWins, [`${b}Wins`]: bWins, ties };
      };
      const regular = tally(finished.filter(game => game.type === 'Season'));
      const rows = [...finished]
        .sort((left, right) => left.season - right.season || (left.week ?? 99) - (right.week ?? 99))
        .map(game => ({ ...gameRow(game, a), winner: game.scoreA === game.scoreB ? 'Tie' : (game.teamA === a ? game.scoreA > game.scoreB : game.scoreB > game.scoreA) ? a : b }));
      return {
        ok: true, title: `${a} vs ${b}`, columns: inferColumns(['season', 'league', 'type', 'when', 'team', 'opponent', 'score', 'opponentScore', 'diff', 'winner'], rows), rows: rows.map(row => ({ ...row })),
        matched: rows.length, truncated: false,
        caveats: ['The summary is the record. meetings and the win counts beside it are the regular season. cup, superBowl, and all are already totaled; do not add those groups yourself.', ...liveNote, ...(rows.length ? [] : ['They have no finished meetings.'])],
        summary: { a, b, ...regular, regularSeason: regular, cup: tally(finished.filter(game => game.type === 'Cup')), superBowl: tally(finished.filter(game => game.type === 'Superbowl')), all: tally(finished) },
      };
    }
    case 'manager_career': {
      const manager = exactManager(archive, args.name);
      if (!manager) return fail(managerError(archive, String(args.name ?? '')));
      const career = careers(archive.seasons).find(row => row.team === manager);
      const rows = tables.seasons.filter(row => row.team === manager).sort((a, b) => (a.season as number) - (b.season as number));
      const inProgress = rows.some(row => row.status === 'live');
      const room = trophyRoom(manager);
      return {
        ok: true, title: `${manager} career`, columns: inferColumns(Object.keys(TABLE_COLUMNS.seasons), rows, 'seasons'), rows,
        matched: rows.length, truncated: false,
        caveats: [
          ...(inProgress ? [`${IN_PROGRESS_CAVEAT} The career summary counts 2002 to 2025 only.`] : []),
          ...(room ? ['trophyRoom is the commissioner snapshot through 2025. It does not include 2026, and it can disagree with the season rows.'] : []),
        ],
        summary: { ...(career ? { ...career } : { team: manager, note: 'No finished seasons before 2026.' }), ...(room ? { trophyRoom: room } : {}) },
      };
    }
    case 'records': {
      const book = String(args.book ?? 'weekly') as keyof typeof BOOKS;
      if (!(book in BOOKS)) return fail('book must be one of weekly, jffl_cup, league_cup, super_bowl.');
      const kind = String(args.kind ?? 'highest');
      if (!['highest', 'lowest', 'blowouts', 'closest', 'ties'].includes(kind)) return fail('kind must be one of highest, lowest, blowouts, closest, ties.');
      const limit = clamp(args.limit, 15, 1, 100);
      const board = recordBook(resultGames(archive), BOOKS[book]);
      const rows: Row[] = kind === 'highest' || kind === 'lowest'
        ? (kind === 'highest' ? board.highest : board.lowest).slice(0, limit).map((line, index) => ({
          rank: index + 1, season: line.season, league: line.league, when: roundLabel(line), team: line.team, opponent: line.opponent, score: line.score, opponentScore: line.opponentScore,
        }))
        : (kind === 'blowouts' ? board.blowouts : kind === 'closest' ? board.closest : board.ties).slice(0, limit).map((game, index) => {
          const winnerFirst = game.scoreA >= game.scoreB;
          const winner = winnerFirst ? game.teamA : game.teamB;
          const loser = winnerFirst ? game.teamB : game.teamA;
          return {
            rank: index + 1, season: game.season, league: game.league, when: roundLabel(game), team: winner, opponent: loser,
            score: winnerFirst ? game.scoreA : game.scoreB, opponentScore: winnerFirst ? game.scoreB : game.scoreA, margin: Math.abs(game.scoreA - game.scoreB),
          };
        });
      const names = ['rank', 'season', 'league', 'when', 'team', 'opponent', 'score', 'opponentScore', ...(kind === 'highest' || kind === 'lowest' ? [] : ['margin'])];
      return {
        ok: true, title: `${BOOK_LABEL[book]} ${kind}`, columns: inferColumns(names, rows), rows, matched: board.games, truncated: false,
        caveats: [...(book === 'jffl_cup' ? ['JFFL Cup scores are two-week totals.'] : book === 'weekly' ? ['2002 has almost no weekly game scores.'] : []), ...liveNote],
        summary: { games: board.games, ties: board.ties.length, decidedByOnePoint: board.closest.length },
      };
    }
    case 'title_years': {
      const last = lastSeason(archive);
      const from = clamp(args.from, 2002, 2002, last);
      const to = clamp(args.to, last, 2002, last);
      const league = args.league ? String(args.league) : null;
      const rows: Row[] = [];
      let leagues = 0; let same = 0;
      for (const year of titleYears(allSeasons(archive))) {
        if (year.season < from || year.season > to) continue;
        for (const item of year.leagues) {
          if (league && item.league.toLowerCase() !== league.toLowerCase()) continue;
          if (item.superBowl) { leagues += 1; if (item.same) same += 1; }
          rows.push({
            season: year.season, league: item.league, bestRecord: item.seasonChamps.join(', ') || null, superBowl: item.superBowl, leagueCup: item.cup,
            jfflCup: year.jffl, bestRecordWonSuperBowl: item.superBowl ? (item.same ? 1 : 0) : null,
          });
        }
      }
      return {
        ok: true, title: 'Title winners', columns: inferColumns(['season', 'league', 'bestRecord', 'superBowl', 'leagueCup', 'jfflCup', 'bestRecordWonSuperBowl'], rows), rows,
        matched: rows.length, truncated: false,
        caveats: [
          'bestRecord is regular-season rank 1. In 2006 two managers share it in one league. JFFL Cup begins in 2013.',
          ...(archive.live && to >= archive.live.season ? [`${archive.live.season} is in progress. Titles not decided yet are null.`] : []),
        ],
        summary: { leaguesWithSuperBowl: leagues, bestRecordWonSuperBowl: same },
      };
    }
    case 'draft_slot_stats': {
      const by = String(args.by ?? 'bucket');
      if (by === 'slot') {
        const rows: Row[] = [];
        const bySlot = new Map<number, { seasons: number; titles: number; topThree: number }>();
        for (const season of archive.seasons) {
          if (season.draft == null || season.rankSeason == null) continue;
          const bucket = bySlot.get(season.draft) ?? { seasons: 0, titles: 0, topThree: 0 };
          bucket.seasons += 1;
          if (season.rankSeason === 1) bucket.titles += 1;
          if (season.rankSeason <= 3) bucket.topThree += 1;
          bySlot.set(season.draft, bucket);
        }
        for (const [slot, bucket] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) rows.push({ slot, seasons: bucket.seasons, titles: bucket.titles, titleRate: rate(bucket.titles, bucket.seasons), topThree: bucket.topThree, topThreeRate: rate(bucket.topThree, bucket.seasons) });
        return { ok: true, title: 'Draft slot results', columns: inferColumns(['slot', 'seasons', 'titles', 'titleRate', 'topThree', 'topThreeRate'], rows), rows, matched: rows.length, truncated: false, caveats: ['Single slots have few seasons each, so rates move a lot. Prefer buckets for conclusions.'] };
      }
      const rows: Row[] = draftBuckets(archive.seasons).map(bucket => ({ bucket: bucket.label, seasons: bucket.seasons, titles: bucket.titles, titleRate: rate(bucket.titles, bucket.seasons), topThree: bucket.topThree, topThreeRate: rate(bucket.topThree, bucket.seasons) }));
      return { ok: true, title: 'Draft slot results', columns: inferColumns(['bucket', 'seasons', 'titles', 'titleRate', 'topThree', 'topThreeRate'], rows), rows, matched: rows.length, truncated: false, caveats: ['A season counts when the draft slot and the regular-season rank are both known. Title means regular-season rank 1.'] };
    }
    case 'schedule': {
      const live = archive.live;
      if (!live) return fail('The current season is not loaded, so there is no schedule.');
      const current = live.week ?? 1;
      const last = Math.max(current, ...live.schedule.map(row => row.lastWeek));
      const from = clamp(args.fromWeek, current, 1, last);
      const to = clamp(args.toWeek, Math.min(from + 2, last), from, last);
      const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
      const manager = typeof args.manager === 'string' && args.manager.trim() ? fold(args.manager) : null;
      const league = typeof args.league === 'string' && args.league.trim() ? fold(args.league).replace(/league$/, '') : null;
      if (manager && !live.schedule.some(row => fold(row.team) === manager)) return fail(`"${String(args.manager)}" has no ${live.season} games. Use resolve_entity to check the name.`);
      const rows: Row[] = live.schedule
        .filter(row => row.lastWeek >= from && row.week <= to)
        .filter(row => !manager || fold(row.team) === manager)
        .filter(row => !league || fold(row.league).replace(/league$/, '') === league)
        .filter(row => args.type !== 'Season' && args.type !== 'Cup' || row.type === args.type)
        .map(row => ({ week: row.week === row.lastWeek ? String(row.week) : `${row.week}-${row.lastWeek}`, league: row.league, type: row.type, round: row.round, team: row.team, opponent: row.opponent, status: row.status, score: row.score, opponentScore: row.opponentScore, projected: row.projected, opponentProjected: row.opponentProjected, winChance: row.winChance, finals: finalsNote(row.team, row.opponent)?.text ?? null }));
      const capped = rows.slice(0, 120);
      const scheduledCup = rows.some(row => row.type === 'Cup' && row.status === 'scheduled');
      return {
        ok: true, title: `${live.season} schedule, weeks ${from}-${to}`, columns: inferColumns(['week', 'league', 'type', 'round', 'team', 'opponent', 'status', 'score', 'opponentScore', 'projected', 'opponentProjected', 'winChance', 'finals'], capped), rows: capped,
        matched: rows.length, truncated: rows.length > capped.length,
        caveats: [
          `Schedule as of ${asOfLabel(asOf)}. Scores are null for games not played yet. Projections are the last ESPN live projection saved for that week; null means none was saved. A cup tie adds those weekly projections and is null when any week of the tie has none. winChance is the scoreboard percent for an undecided league game; it is null once the game is final, when a projection is missing, and on cup ties. finals is their record across every competition and who won their past final, or null when they have not met in one. Say that sentence once with the matchup.`,
          ...(rows.some(row => row.status === 'live') ? ['Games marked live are still being played, so their scores can change.'] : []),
          ...(scheduledCup ? ['Cup opponents shown as "Winner of ..." depend on games not finished yet. JFFL Cup ties are two-week totals.'] : []),
          ...(to >= REGULAR_WEEKS ? ['Playoff pairings appear only once ESPN sets them.'] : []),
        ],
        summary: { currentWeek: current, lastScheduledWeek: last },
      };
    }
    case 'week_slice': {
      const week = clamp(args.week, 1, 1, 18);
      const board = recordBook(resultGames(archive), game => game.type === 'Season' && game.week === week);
      const byYear = new Map<number, (typeof board.highest)[number]>();
      for (const line of board.highest) if (!byYear.has(line.season)) byYear.set(line.season, line);
      const rows: Row[] = [...byYear.values()].sort((a, b) => a.season - b.season).map(line => ({ season: line.season, league: line.league, team: line.team, score: line.score, opponent: line.opponent, opponentScore: line.opponentScore }));
      const high = board.highest[0]; const low = board.lowest[0];
      return {
        ok: true, title: `Week ${week} high score by season`, columns: inferColumns(['season', 'league', 'team', 'score', 'opponent', 'opponentScore'], rows), rows, matched: board.games, truncated: false,
        caveats: [...(board.games ? [] : [`No regular-season games were played in week ${week}.`]), ...liveNote],
        summary: { games: board.games, highest: high ? { team: high.team, score: high.score, season: high.season } : null, lowest: low ? { team: low.team, score: low.score, season: low.season } : null },
      };
    }
    case 'double_duty': {
      const which = String(args.cup ?? 'all');
      if (!['all', 'league', 'jffl'].includes(which)) return fail('cup must be all, league, or jffl.');
      const manager = args.manager == null || args.manager === '' ? null : exactManager(archive, args.manager);
      if (args.manager != null && args.manager !== '' && !manager) return fail(managerError(archive, String(args.manager)));
      const last = lastSeason(archive);
      const from = args.from == null || args.from === '' ? 2013 : clamp(args.from, 2013, 2002, last);
      const to = args.to == null || args.to === '' ? last : clamp(args.to, last, 2002, last);
      const rows = sameWeekDoubles(archive).filter(row => {
        const season = row.season as number;
        if (season < from || season > to) return false;
        if (which === 'jffl' && row.cup !== 'JFFL') return false;
        if (which === 'league' && row.cup === 'JFFL') return false;
        if (manager && row.team !== manager && row.opponent !== manager) return false;
        return true;
      });
      return {
        ok: true, title: 'Same-week league and cup matchups', columns: inferColumns(['season', 'week', 'cup', 'round', 'team', 'opponent', 'leagueScore', 'opponentLeagueScore', 'cupScore', 'opponentCupScore', 'status'], rows), rows,
        matched: rows.length, truncated: false,
        caveats: [
          'Each row is two managers who played each other in a regular-season game and a cup tie in the same scheduled week. League cup rounds are weeks 2, 5, 8, and 11. JFFL Cup rounds are weeks 3–4, 6–7, 9–10, 12–13, and 15–16.',
          'A league-cup score is that same week\'s points. A JFFL Cup score is the two-week total, so it will not equal the one league game. A level replay is the next week. Before 2026 the workbook does not mark replays, so a double that happened only on a replay week is not listed.',
          ...(rows.some(row => row.status === 'live') ? ['Rows marked live are still being played.'] : []),
          ...(rows.length ? [] : ['No same-week doubles matched.']),
        ],
        summary: { matchups: rows.length },
      };
    }
    case 'scoring_settings': {
      const live = archive.live;
      if (!live) return fail('The current season is not loaded, so scoring settings are not available.');
      const leagueFilter = typeof args.league === 'string' && args.league.trim() ? foldName(args.league).replace(/league$/, '') : null;
      const itemFilter = typeof args.item === 'string' && args.item.trim() ? args.item.trim().toLowerCase() : null;
      const rows: Row[] = [];
      const missing: string[] = [];
      for (const meta of LEAGUE_META) {
        const summary = live.summaries[meta.slug];
        if (!summary) continue;
        const short = SHORT_LEAGUE[meta.slug];
        if (leagueFilter && foldName(short).replace(/league$/, '') !== leagueFilter && foldName(meta.slug).replace(/-/g, '') !== leagueFilter) continue;
        if (!summary.scoring.length) missing.push(`${short} has no scoring list on this snapshot.`);
        for (const item of summary.scoring) {
          const label = scoringLabel(item.name);
          if (itemFilter && !label.toLowerCase().includes(itemFilter)) continue;
          rows.push({ league: short, item: label, points: item.points });
        }
      }
      return {
        ok: true, title: 'Scoring settings', columns: inferColumns(['league', 'item', 'points'], rows), rows,
        matched: rows.length, truncated: false,
        caveats: ['Each league keeps its own ESPN scoring. The same NFL player can be worth different points in two leagues. A setting that is not listed is unknown, not zero.', ...missing, ...(rows.length ? [] : ['No scoring settings matched. Call again with a shorter item name.'])],
        summary: { season: live.season },
      };
    }
    case 'manager_profiles': {
      const requested = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : null;
      const people = namedManagers(requested);
      if (requested && !people.length) return fail(`No trophy-room profile for "${requested}". Use resolve_entity to check the name.`);
      const rows: Row[] = people.map(person => ({ manager: person.manager, ...trophyRoom(person.manager)! }));
      return {
        ok: true, title: 'Trophy room', columns: inferColumns(['manager', 'league', 'trophies', 'finals', 'trophies2025', 'trophies2021', 'trophies2013', 'seasons', 'cupRank', 'cupRankLabel', 'cupAverageFinish', 'cupWins', 'cupLosses', 'cupTitles', 'jfflSeed', 'leagueCupSeed', 'week2Rank', 'draftRank'], rows), rows,
        matched: rows.length, truncated: false,
        caveats: ['These totals run through 2025 from the commissioner snapshot. They do not include 2026 results. cupRankLabel Rookie means that snapshot had no cup rank. The season rows from query_seasons are a separate workbook and can disagree.'],
      };
    }
    case 'could_have': {
      const live = archive.live;
      if (!live) return fail('The current season is not loaded, so lineups are not available.');
      if (!Object.keys(live.rosters).length) return fail('Rosters are not loaded, so could-have lineups are not available.');
      const week = args.week == null || args.week === '' ? (live.week ?? 1) : clamp(args.week, live.week ?? 1, 1, 18);
      const manager = typeof args.manager === 'string' && args.manager.trim() ? foldName(args.manager) : null;
      const rows: Row[] = live.swings
        .filter(row => row.week === week && (!manager || foldName(row.team) === manager))
        .map(row => ({ week: row.week, league: row.league, team: row.team, opponent: row.opponent, score: row.score, opponentScore: row.opponentScore, wouldScore: row.wouldScore, final: row.final ? 1 : 0, swaps: row.swaps }));
      return {
        ok: true, title: `Could have had 'em, week ${week}`, columns: inferColumns(['week', 'league', 'team', 'opponent', 'score', 'opponentScore', 'wouldScore', 'final', 'swaps'], rows), rows,
        matched: rows.length, truncated: false,
        caveats: [
          'Same rule as the weekly roundup: the fewest start/sit moves that would have beaten the opponent. Injured reserve is left out. A starter with no posted score leaves that side out. A missing bench score is left out, not treated as zero.',
          ...(rows.length ? [] : [`No would-be lineup in week ${week}. The trailing lineups may already be optimal, a starter may have no score yet, or that week's lineup may be missing from the snapshot.`]),
          ...(!live.rostersLoaded ? ['Not every league roster is loaded.'] : []),
        ],
      };
    }
    case 'player_stats': {
      const live = archive.live;
      if (!live || !Object.keys(live.rosters).length) return fail('Rosters are not loaded, so player stats are not available.');
      const name = String(args.name ?? '').trim();
      if (!name) return fail('player_stats needs a player name.');
      const folded = foldName(name);
      const spots = LEAGUE_META.flatMap(meta => (live.rosters[meta.slug]?.players ?? []).filter(player => foldName(player.name).includes(folded)).map(player => ({ slug: meta.slug, player })));
      const exact = spots.filter(spot => foldName(spot.player.name) === folded);
      const chosen = exact.length ? exact : spots;
      if (!chosen.length) return fail(`No rostered player matches "${name}".`);
      const distinct = [...new Set(chosen.map(spot => spot.player.name))];
      if (!exact.length && distinct.length > 1) return fail(`Several players match "${name}": ${distinct.join(', ')}. Use the full name.`);
      const weekFilter = args.week == null || args.week === '' ? null : clamp(args.week, 1, 1, 18);
      const rank = (stat: string) => { const index = STAT_ORDER.indexOf(stat); return index === -1 ? STAT_ORDER.length : index; };
      const rows: Row[] = [];
      const profiles: Record<string, unknown>[] = [];
      for (const spot of chosen) {
        const roster = live.rosters[spot.slug];
        if (!roster) continue;
        const team = MANAGERS.find(item => item.slug === spot.slug && item.teamId === spot.player.teamId)?.manager ?? spot.player.teamId;
        const base = { league: SHORT_LEAGUE[spot.slug], team, player: spot.player.name };
        const add = (scope: string, week: number | null, stat: string, value: number | null | undefined) => {
          if (typeof value !== 'number' || !Number.isFinite(value)) return;
          rows.push({ ...base, scope, week, stat, value });
        };
        profiles.push({
          ...base, slot: spot.player.slot, eligible: slotsLabel(spot.player.eligibleSlots),
          injury: injuryName(spot.player.injuryStatus) ?? null,
          projected: spot.player.projectedPoints, seasonPoints: spot.player.seasonPoints, averagePoints: spot.player.averagePoints, weekPoints: spot.player.weekPoints, week: roster.week,
        });
        if (weekFilter == null) {
          add('season', null, 'Fantasy points', spot.player.seasonPoints);
          add('season', null, 'Average', spot.player.averagePoints);
          for (const [key, value] of Object.entries(spot.player.seasonStats)) add('season', null, key, value);
        }
        const weeks = new Map<number, { points: number | null; stats: Record<string, number> }>();
        for (const line of spot.player.weeklyStats ?? []) weeks.set(line.week, { points: line.points ?? null, stats: { ...(line.stats ?? {}) } });
        for (const lineup of roster.weeklyLineups ?? []) {
          const played = lineup.players.find(item => item.id === spot.player.id);
          if (played?.points == null) continue;
          const existing = weeks.get(lineup.week) ?? { points: null, stats: {} };
          if (existing.points == null) existing.points = played.points;
          weeks.set(lineup.week, existing);
        }
        if (spot.player.weekPoints != null || Object.keys(spot.player.weekStats).length) {
          const existing = weeks.get(roster.week) ?? { points: null, stats: {} };
          if (existing.points == null) existing.points = spot.player.weekPoints;
          for (const [key, value] of Object.entries(spot.player.weekStats)) if (existing.stats[key] == null && value != null) existing.stats[key] = value;
          weeks.set(roster.week, existing);
        }
        for (const [week, info] of [...weeks.entries()].sort((a, b) => a[0] - b[0])) {
          if (weekFilter != null && week !== weekFilter) continue;
          add('week', week, 'Fantasy points', info.points);
          for (const key of Object.keys(info.stats).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) add('week', week, key, info.stats[key]);
        }
      }
      const counting = rows.some(row => row.stat !== 'Fantasy points' && row.stat !== 'Average');
      return {
        ok: true, title: `${distinct[0] ?? name} stats`, columns: inferColumns(['league', 'team', 'player', 'scope', 'week', 'stat', 'value'], rows), rows,
        matched: rows.length, truncated: false,
        caveats: [
          'Counting stats use the same labels as the player page. A stat that is absent was not on the snapshot. Do not turn that absence into zero.',
          ...(counting ? [] : ['This snapshot has fantasy points for this player and no counting stats such as yards or touchdowns.']),
        ],
        summary: { players: profiles },
      };
    }
    default: return fail(`Unknown tool ${String(name)}.`);
  }
}

// ---------- What the model sees ----------

function columnStats(columns: Column[], rows: Row[]) {
  const stats: Record<string, { min: number; max: number; mean: number }> = {};
  for (const column of columns) {
    if (column.type !== 'number') continue;
    const values = rows.map(row => row[column.name]).filter((cell): cell is number => typeof cell === 'number');
    if (!values.length) continue;
    stats[column.name] = { min: Math.min(...values), max: Math.max(...values), mean: roundTo(values.reduce((sum, value) => sum + value, 0) / values.length, 2) };
  }
  return stats;
}

export function datasetForModel(dataset: Dataset) {
  const all = dataset.rows.length <= MODEL_ROWS || (!dataset.truncated && dataset.rows.length <= COMPLETE_ROWS);
  return {
    ok: true,
    datasetId: dataset.id,
    title: dataset.title,
    columns: dataset.columns,
    rowCount: dataset.rows.length,
    rowsMatched: dataset.matched,
    truncated: dataset.truncated,
    rows: all ? dataset.rows : dataset.rows.slice(0, MODEL_PREVIEW),
    ...(all ? {} : { note: `Only the first ${MODEL_PREVIEW} of ${dataset.rows.length} rows are shown. This is a sample: do not add, count, or rate it. Call the query again with groupBy and aggregates so the tool totals every matching row. All rows are in ${dataset.id} for charts.`, columnStats: columnStats(dataset.columns, dataset.rows) }),
    ...(dataset.summary ? { summary: dataset.summary } : {}),
    caveats: dataset.caveats,
  };
}