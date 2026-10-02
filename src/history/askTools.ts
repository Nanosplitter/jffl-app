import {
  JFFL_CUP, LEAGUE_CUP, SUPER_BOWL, WEEKLY,
  careers, draftBuckets, pairGames, rate, recordBook, roundLabel, titleYears,
  type HistoryGame, type HistorySeason,
} from './stats.ts';
import { finishedGames, type LiveSeason } from './liveSeason.ts';

export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type ColumnType = 'number' | 'string';
export interface Column { name: string; type: ColumnType }
/** `live` is the in-progress season built from the shared league snapshots; history stays in games and seasons. */
export interface Archive { games: HistoryGame[]; seasons: HistorySeason[]; live?: LiveSeason | null }

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

export const TABLE_COLUMNS: Record<TableName, Record<string, { type: ColumnType; about: string }>> = {
  team_games: {
    season: { type: 'number', about: 'Season year, 2002 to 2026 (2026 is in progress)' },
    league: { type: 'string', about: 'Combined (single league before 2013), Premier, Championship, League One, or JFFL (cross-league cup)' },
    type: { type: 'string', about: 'Season (regular season), Cup, or Superbowl' },
    round: { type: 'string', about: 'Week number for Season games, otherwise a round label such as Final' },
    week: { type: 'number', about: 'Regular-season week, null for Cup and Superbowl games' },
    team: { type: 'string', about: 'Manager nickname for this side of the game' },
    opponent: { type: 'string', about: 'Opposing manager nickname' },
    score: { type: 'number', about: 'This side\u2019s score (null if ESPN has not reported it yet)' },
    opponentScore: { type: 'number', about: 'Opponent score' },
    diff: { type: 'number', about: 'score minus opponentScore (negative means a loss)' },
    margin: { type: 'number', about: 'Absolute score difference' },
    result: { type: 'string', about: 'W, L, or T. For a live game this is the current state, not a result' },
    win: { type: 'number', about: '1 if this side won, otherwise 0' },
    loss: { type: 'number', about: '1 if this side lost, otherwise 0' },
    tie: { type: 'number', about: '1 if tied, otherwise 0' },
    twoWeekCup: { type: 'number', about: '1 for JFFL Cup games, whose scores are two-week totals and are not comparable to a single week' },
    status: { type: 'string', about: 'final, or live for a 2026 game still being played (its score can change)' },
  },
  seasons: {
    season: { type: 'number', about: 'Season year, 2002 to 2026 (2026 is in progress)' },
    team: { type: 'string', about: 'Manager nickname' },
    league: { type: 'string', about: 'League that manager played in that year' },
    rankSeason: { type: 'number', about: 'Regular-season finish in the league, 1 is best. Null for 2026 until week 14 is final' },
    standing: { type: 'number', about: 'Current league position. Equals rankSeason for finished seasons' },
    rankFinal: { type: 'number', about: 'Super Bowl finish, 1 is champion' },
    jfflRank: { type: 'number', about: 'JFFL Cup finish, 1 is champion (2013 onward)' },
    cupRank: { type: 'number', about: 'League cup finish, 1 is champion' },
    points: { type: 'number', about: 'Total regular-season points scored (2026: so far)' },
    pointsPerWeek: { type: 'number', about: 'Average points per week' },
    wins: { type: 'number', about: 'Regular-season wins' },
    losses: { type: 'number', about: 'Regular-season losses' },
    ties: { type: 'number', about: 'Regular-season ties' },
    draft: { type: 'number', about: 'Draft slot, 1 picks first. Unknown (null) for 2026' },
    pointsRank: { type: 'number', about: 'Rank by points scored within the league' },
    seasonChamp: { type: 'number', about: '1 if finished first in the regular season, 0 if not, null if unknown' },
    superBowlChamp: { type: 'number', about: '1 if won the league Super Bowl, 0 if not, null if unknown' },
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
    status: { type: 'string', about: 'final, or live while that week is still being played' },
  },
};

export const DATA_NOTES = [
  'Seasons 2002 through 2025 are complete history. 2026 is in progress and comes from the live league snapshots, when they are loaded.',
  'Rows with status live are games still being played. Their scores can change. Records and "best ever" questions should use status final.',
  '2026 titles stay unknown (null) until they are decided. Player-level data (player_weeks) exists only for 2026.',
  '2002 has standings and Super Bowl results but almost no weekly game scores.',
  'JFFL Cup games (league JFFL, 2013 onward) use two-week totals. Do not compare those scores with a single week.',
  'Ties are separate from wins and losses.',
  'Names are manager nicknames. "team" always means the manager.',
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

export function prepareTables(archive: Archive): Record<TableName, Row[]> {
  const teamGames: Row[] = [];
  const games: GameLike[] = [...archive.games, ...(archive.live?.games ?? [])];
  for (const game of games) {
    const twoWeek = game.type === 'Cup' && game.league === 'JFFL' ? 1 : 0;
    const status = game.status ?? 'final';
    const side = (team: string, opponent: string, score: number | null, other: number | null): Row => {
      const known = score !== null && other !== null;
      return {
        season: game.season, league: game.league, type: game.type, round: game.round, week: game.week,
        team, opponent, score, opponentScore: other,
        diff: known ? score - other : null, margin: known ? Math.abs(score - other) : null,
        result: known ? score > other ? 'W' : score < other ? 'L' : 'T' : null,
        win: known ? score > other ? 1 : 0 : null, loss: known ? score < other ? 1 : 0 : null, tie: known ? score === other ? 1 : 0 : null,
        twoWeekCup: twoWeek, status,
      };
    };
    teamGames.push(side(game.teamA, game.teamB, game.scoreA, game.scoreB), side(game.teamB, game.teamA, game.scoreB, game.scoreA));
  }
  const flag = (rank: number | null, test: (value: number) => boolean) => rank == null ? null : test(rank) ? 1 : 0;
  const seasonRow = (row: HistorySeason & { standing?: number | null }, status: string): Row => ({
    season: row.season, team: row.team, league: row.league,
    rankSeason: row.rankSeason, standing: row.standing === undefined ? row.rankSeason : row.standing,
    rankFinal: row.rankFinal, jfflRank: row.jfflRank, cupRank: row.cupRank,
    points: row.points, pointsPerWeek: row.pointsPerWeek, wins: row.wins, losses: row.losses, ties: row.ties,
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

/** All seasons including the in-progress one, for title and manager lookups. Undecided 2026 ranks are null. */
const allSeasons = (archive: Archive): HistorySeason[] => [...archive.seasons, ...(archive.live?.seasons ?? [])];
/** History games plus finished 2026 games. Live games are never counted as results. */
const resultGames = (archive: Archive): HistoryGame[] => [...archive.games, ...finishedGames(archive.live)];
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

export const DATA_TOOL_NAMES = ['query_games', 'query_seasons', 'query_players', 'resolve_entity', 'head_to_head', 'manager_career', 'records', 'title_years', 'draft_slot_stats', 'week_slice'] as const;
export type DataToolName = (typeof DATA_TOOL_NAMES)[number];
export const isDataTool = (name: string): name is DataToolName => (DATA_TOOL_NAMES as readonly string[]).includes(name);

const BOOKS = { weekly: WEEKLY, jffl_cup: JFFL_CUP, league_cup: LEAGUE_CUP, super_bowl: SUPER_BOWL } as const;
const BOOK_LABEL = { weekly: 'Weekly', jffl_cup: 'JFFL Cup', league_cup: 'League cups', super_bowl: 'Super Bowl' } as const;

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
      const games = pairGames(resultGames(archive), a, b);
      let aWins = 0; let bWins = 0; let ties = 0;
      for (const game of games) {
        const aScore = game.teamA === a ? game.scoreA : game.scoreB;
        const bScore = game.teamA === a ? game.scoreB : game.scoreA;
        if (aScore === bScore) ties += 1; else if (aScore > bScore) aWins += 1; else bWins += 1;
      }
      const rows = games.map(game => ({ ...gameRow(game, a), winner: game.scoreA === game.scoreB ? 'Tie' : (game.teamA === a ? game.scoreA > game.scoreB : game.scoreB > game.scoreA) ? a : b }));
      return {
        ok: true, title: `${a} vs ${b}`, columns: inferColumns(['season', 'league', 'when', 'team', 'opponent', 'score', 'opponentScore', 'diff', 'winner'], rows), rows: rows.map(row => ({ ...row })),
        matched: rows.length, truncated: false,
        caveats: ['Regular-season meetings only. Cup and Super Bowl games are not included.', ...liveNote, ...(rows.length ? [] : ['They have no regular-season meetings.'])],
        summary: { a, b, meetings: games.length, [`${a}Wins`]: aWins, [`${b}Wins`]: bWins, ties },
      };
    }
    case 'manager_career': {
      const manager = exactManager(archive, args.name);
      if (!manager) return fail(managerError(archive, String(args.name ?? '')));
      const career = careers(archive.seasons).find(row => row.team === manager);
      const rows = tables.seasons.filter(row => row.team === manager).sort((a, b) => (a.season as number) - (b.season as number));
      const inProgress = rows.some(row => row.status === 'live');
      return {
        ok: true, title: `${manager} career`, columns: inferColumns(Object.keys(TABLE_COLUMNS.seasons), rows, 'seasons'), rows,
        matched: rows.length, truncated: false,
        caveats: inProgress ? [`${IN_PROGRESS_CAVEAT} The career summary counts 2002 to 2025 only.`] : [],
        summary: career ? { ...career } : { team: manager, note: 'No finished seasons before 2026.' },
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
  const all = dataset.rows.length <= MODEL_ROWS;
  return {
    ok: true,
    datasetId: dataset.id,
    title: dataset.title,
    columns: dataset.columns,
    rowCount: dataset.rows.length,
    rowsMatched: dataset.matched,
    truncated: dataset.truncated,
    rows: all ? dataset.rows : dataset.rows.slice(0, MODEL_PREVIEW),
    ...(all ? {} : { note: `Only the first ${MODEL_PREVIEW} of ${dataset.rows.length} rows are shown here. All rows are in ${dataset.id} for charts.`, columnStats: columnStats(dataset.columns, dataset.rows) }),
    ...(dataset.summary ? { summary: dataset.summary } : {}),
    caveats: dataset.caveats,
  };
}