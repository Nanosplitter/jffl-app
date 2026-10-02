import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyControls, createContext, datasetForModel, parseQuery, resolveEntity, runDataTool, runQuery, type Dataset, type Query } from '../src/history/askTools.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);
const ctx = createContext(archive);

function query(table: 'team_games' | 'seasons', raw: unknown) {
  const parsed = parseQuery(table, raw);
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.error);
  const result = runQuery(ctx.tables, table, (parsed as { value: Query }).value);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

test('the games table has one row per team per game', () => {
  assert.equal(ctx.tables.team_games.length, archive.games.length * 2);
  assert.equal(ctx.tables.seasons.length, archive.seasons.length);
});

test('mean regular-season scores match the scoring eras', () => {
  const early = query('team_games', { filters: [{ field: 'type', op: 'eq', value: 'Season' }, { field: 'season', op: 'between', value: '2003,2012' }], aggregates: [{ fn: 'mean', field: 'score', as: 'mean' }] });
  const later = query('team_games', { filters: [{ field: 'type', op: 'eq', value: 'Season' }, { field: 'season', op: 'between', value: [2013, 2025] }], aggregates: [{ fn: 'mean', field: 'score', as: 'mean' }] });
  assert.equal(Math.round((early.rows[0].mean as number) * 10) / 10, 65.4);
  assert.equal(Math.round((later.rows[0].mean as number) * 10) / 10, 88.1);
  assert.equal(early.caveats.some(text => text.includes('two-week')), false);
});

test('score queries warn when two-week JFFL Cup totals are mixed in', () => {
  const mixed = query('team_games', { aggregates: [{ fn: 'max', field: 'score', as: 'top' }] });
  assert.equal(mixed.rows[0].top, 275);
  assert.ok(mixed.caveats.some(text => text.includes('two-week')));
  const weekly = query('team_games', { filters: [{ field: 'twoWeekCup', op: 'eq', value: 0 }, { field: 'type', op: 'eq', value: 'Season' }], aggregates: [{ fn: 'max', field: 'score', as: 'top' }] });
  assert.equal(weekly.rows[0].top, 170);
  assert.equal(weekly.caveats.some(text => text.includes('two-week')), false);
});

test('single-team questions group and sort', () => {
  const best = query('team_games', {
    filters: [{ field: 'type', op: 'eq', value: 'Season' }],
    groupBy: ['team'],
    aggregates: [{ fn: 'max', field: 'score', as: 'best' }],
    sort: [{ field: 'best', dir: 'desc' }],
    limit: 3,
  });
  assert.deepEqual(best.rows[0], { team: 'Jeff', best: 170 });
  assert.equal(best.rows.length, 3);
  assert.equal(best.truncated, true);
});

test('seasons queries count titles, keep nulls as null, and compute rates', () => {
  const jeff = query('seasons', { filters: [{ field: 'team', op: 'eq', value: 'jeff' }], aggregates: [{ fn: 'sum', field: 'seasonChamp', as: 'titles' }] });
  assert.equal(jeff.rows[0].titles, 7);
  const donna = query('seasons', { filters: [{ field: 'team', op: 'eq', value: 'Donna' }], aggregates: [{ fn: 'sum', field: 'jfflCupChamp', as: 'cups' }] });
  assert.equal(donna.rows[0].cups, 3);
  const unknown = query('seasons', { filters: [{ field: 'season', op: 'eq', value: 2002 }], aggregates: [{ fn: 'mean', field: 'jfflRank', as: 'avg' }] });
  assert.equal(unknown.rows[0].avg, null);
  const draftRate = query('seasons', { filters: [{ field: 'draft', op: 'eq', value: 1 }, { field: 'rankSeason', op: 'not_null' }], aggregates: [{ fn: 'rate', as: 'titleRate', when: [{ field: 'rankSeason', op: 'eq', value: 1 }] }] });
  assert.equal(draftRate.rows[0].titleRate, 9.8);
});

test('ties stay separate from wins and losses', () => {
  const ties = query('team_games', { filters: [{ field: 'type', op: 'eq', value: 'Season' }], aggregates: [{ fn: 'sum', field: 'tie', as: 'ties' }, { fn: 'sum', field: 'win', as: 'wins' }, { fn: 'sum', field: 'loss', as: 'losses' }] });
  assert.equal(ties.rows[0].ties, 120);
  assert.equal(ties.rows[0].wins, ties.rows[0].losses);
});

test('invalid queries explain how to fix them', () => {
  const unknown = parseQuery('seasons', { filters: [{ field: 'nope', op: 'eq', value: '1' }] });
  assert.equal(unknown.ok, false);
  assert.match((unknown as { error: string }).error, /Valid fields for seasons/);
  assert.equal(parseQuery('seasons', { filters: [{ field: 'season', op: 'eq', value: 'abc' }] }).ok, false);
  assert.equal(parseQuery('team_games', { aggregates: [{ fn: 'rate' }] }).ok, false);
  assert.equal(parseQuery('team_games', { aggregates: [{ fn: 'mean', field: 'team' }] }).ok, false);
  const badSort = runQuery(ctx.tables, 'seasons', { sort: [{ field: 'zzz' }] });
  assert.equal(badSort.ok, false);
});

test('live controls add filters without mutating the stored query', () => {
  const base: Query = { aggregates: [{ fn: 'count', as: 'games' }] };
  const narrowed = applyControls('team_games', base, { from: 2013, excludeTwoWeek: true, types: ['Season'] });
  assert.deepEqual(base, { aggregates: [{ fn: 'count', as: 'games' }] });
  const all = query('team_games', base).rows[0].games as number;
  const some = runQuery(ctx.tables, 'team_games', narrowed);
  assert.equal(some.ok && (some.value.rows[0].games as number) < all, true);
});

test('manager names resolve with typos and partial matches', () => {
  assert.equal(resolveEntity(archive, 'jeff').exact, true);
  assert.equal(resolveEntity(archive, 'JEFF ').matches[0].name, 'Jeff');
  assert.equal(resolveEntity(archive, 'seant').matches[0].name, 'SeanT');
  assert.ok(resolveEntity(archive, 'Becki').matches.some(match => match.name === 'Becky'));
  assert.deepEqual(resolveEntity(archive, '!!!').matches, []);
});

test('head to head matches the series table and rejects unknown names', () => {
  const result = runDataTool(ctx, 'head_to_head', { a: 'becky', b: 'Jeff' });
  assert.equal(result.ok, true);
  assert.deepEqual((result as { summary: unknown }).summary, { a: 'Becky', b: 'Jeff', meetings: 14, BeckyWins: 0, JeffWins: 14, ties: 0 });
  const wayne = runDataTool(ctx, 'head_to_head', { a: 'SeanT', b: 'Wayne' });
  assert.equal((wayne as { rows: unknown[] }).rows.length, 25);
  const missing = runDataTool(ctx, 'head_to_head', { a: 'Zzzz', b: 'Jeff' });
  assert.equal(missing.ok, false);
});

test('records keep the JFFL Cup book separate from weekly scores', () => {
  const weekly = runDataTool(ctx, 'records', { book: 'weekly', kind: 'highest', limit: 3 }) as { rows: Array<Record<string, unknown>> };
  assert.equal(weekly.rows[0].team, 'Jeff');
  assert.equal(weekly.rows[0].score, 170);
  const cup = runDataTool(ctx, 'records', { book: 'jffl_cup', kind: 'highest', limit: 1 }) as { rows: Array<Record<string, unknown>>; caveats: string[] };
  assert.equal(cup.rows[0].score, 275);
  assert.ok(cup.caveats.some(text => text.includes('two-week')));
  assert.equal(runDataTool(ctx, 'records', { book: 'nope' }).ok, false);
});

test('title years report the 7 of 42 Super Bowl overlap', () => {
  const result = runDataTool(ctx, 'title_years', {}) as { summary: { leaguesWithSuperBowl: number; bestRecordWonSuperBowl: number }; rows: Array<Record<string, unknown>> };
  assert.deepEqual(result.summary, { leaguesWithSuperBowl: 42, bestRecordWonSuperBowl: 7 });
  const championship = result.rows.find(row => row.season === 2019 && row.league === 'Championship');
  assert.equal(championship?.bestRecord, 'Michael');
  assert.equal(championship?.superBowl, 'Brendan');
});

test('manager careers and draft buckets reuse the archive helpers', () => {
  const career = runDataTool(ctx, 'manager_career', { name: 'jeff' }) as { summary: Record<string, unknown>; rows: unknown[] };
  assert.equal(career.summary.seasonTitles, 7);
  assert.ok(career.rows.length >= 20);
  const buckets = runDataTool(ctx, 'draft_slot_stats', {}) as { rows: Array<Record<string, unknown>> };
  assert.equal(buckets.rows[0].titleRate, 9.8);
  assert.equal(buckets.rows[3].titleRate, 4.8);
  assert.ok((runDataTool(ctx, 'week_slice', { week: 2 }) as { matched: number }).matched > 200);
});

test('within keeps the extreme rows in each group, including ties, then counts them', () => {
  const rows = [
    { season: 2020, league: 'Premier', week: 1, team: 'A', score: 70 },
    { season: 2020, league: 'Premier', week: 1, team: 'B', score: 90 },
    { season: 2020, league: 'Premier', week: 2, team: 'A', score: 80 },
    { season: 2020, league: 'Premier', week: 2, team: 'B', score: 60 },
    { season: 2020, league: 'Premier', week: 3, team: 'A', score: 50 },
    { season: 2020, league: 'Premier', week: 3, team: 'B', score: 50 },
    { season: 2020, league: 'Premier', week: 4, team: 'A', score: null },
    { season: 2020, league: 'Premier', week: 4, team: 'B', score: 40 },
  ];
  const tables = { team_games: rows, seasons: [] } as unknown as typeof ctx.tables;
  const counted = runQuery(tables, 'team_games', {
    within: { groupBy: ['season', 'league', 'week'], fn: 'min', field: 'score' },
    groupBy: ['team'],
    aggregates: [{ fn: 'count', as: 'weeks' }],
    sort: [{ field: 'weeks', dir: 'desc' }],
  });
  assert.equal(counted.ok, true);
  if (!counted.ok) return;
  assert.deepEqual(counted.value.rows, [{ team: 'B', weeks: 3 }, { team: 'A', weeks: 2 }]);
  assert.match(counted.value.caveats[0], /Kept 5 of 8/);
  const highs = runQuery(tables, 'team_games', {
    within: { groupBy: ['week'], fn: 'max', field: 'score' },
    select: ['week', 'team', 'score'],
    sort: [{ field: 'week', dir: 'asc' }],
  });
  assert.equal(highs.ok, true);
  if (!highs.ok) return;
  assert.deepEqual(highs.value.rows, [
    { week: 1, team: 'B', score: 90 },
    { week: 2, team: 'A', score: 80 },
    { week: 3, team: 'A', score: 50 },
    { week: 3, team: 'B', score: 50 },
    { week: 4, team: 'B', score: 40 },
  ]);
  assert.equal(parseQuery('team_games', { within: { groupBy: ['season'], fn: 'sum', field: 'score' } }).ok, false);
  assert.equal(parseQuery('team_games', { within: { groupBy: [], fn: 'min', field: 'score' } }).ok, false);
  assert.equal(parseQuery('team_games', { within: { groupBy: ['week'], fn: 'min', field: 'team' } }).ok, false);
});

test('a weekly-low count over the archive is a short sorted list', () => {
  const result = query('team_games', {
    filters: [{ field: 'type', op: 'eq', value: 'Season' }, { field: 'score', op: 'not_null' }],
    within: { groupBy: ['season', 'league', 'week'], fn: 'min', field: 'score' },
    groupBy: ['season', 'team'],
    aggregates: [{ fn: 'count', as: 'weeks' }],
    sort: [{ field: 'weeks', dir: 'desc' }],
    limit: 15,
  });
  assert.equal(result.rows.length, 15);
  assert.equal(result.truncated, true);
  const weeks = result.rows.map(row => row.weeks as number);
  assert.ok(weeks.every((value, index) => index === 0 || value <= weeks[index - 1]));
  assert.ok(weeks[0] >= 2 && weeks[0] <= 14);
  assert.equal(typeof result.rows[0].team, 'string');
  assert.match(result.caveats[0], /min score/);
});

test('the model sees a compact preview, not every row', () => {
  const big = query('team_games', { filters: [{ field: 'type', op: 'eq', value: 'Season' }], select: ['season', 'team', 'score'], limit: 200 });
  const dataset: Dataset = { id: 'ds9', title: 't', columns: big.columns, rows: big.rows, source: { tool: 'query_games', args: {} }, caveats: big.caveats, truncated: big.truncated, matched: big.matched };
  const seen = datasetForModel(dataset) as { rows: unknown[]; columnStats?: Record<string, { max: number }>; note?: string };
  assert.equal(seen.rows.length, 25);
  assert.ok(seen.note?.includes('ds9'));
  assert.equal(seen.columnStats?.score.max, Math.max(...big.rows.map(row => row.score as number)));
});
