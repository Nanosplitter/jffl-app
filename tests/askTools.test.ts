import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyControls, createContext, datasetForModel, parseQuery, resolveEntity, runDataTool, runQuery, type Dataset, type Query } from '../src/history/askTools.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';
import type { SummaryMap } from '../src/competitions.ts';
import { buildLiveSeason, type RosterMap } from '../src/history/liveSeason.ts';

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
  const summary = (result as { summary: { meetings: number; BeckyWins: number; JeffWins: number; ties: number; regularSeason: { meetings: number }; all: { meetings: number }; cup: { meetings: number }; superBowl: { meetings: number } } }).summary;
  assert.equal(summary.meetings, 14);
  assert.equal(summary.JeffWins, 14);
  assert.equal(summary.BeckyWins, 0);
  assert.equal(summary.ties, 0);
  assert.equal(summary.regularSeason.meetings, 14);
  assert.equal(summary.all.meetings, summary.regularSeason.meetings + summary.cup.meetings + summary.superBowl.meetings);
  const wayne = runDataTool(ctx, 'head_to_head', { a: 'SeanT', b: 'Wayne' }) as { rows: Array<Record<string, unknown>> };
  assert.equal(wayne.rows.filter(row => row.type === 'Season').length, 25);
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

test('title years report the 7 of 42 Superbowl overlap', () => {
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
  assert.match(seen.note ?? '', /do not add, count, or rate/i);
  assert.equal(seen.columnStats?.score.max, Math.max(...big.rows.map(row => row.score as number)));
});

test('cup rows carry each manager\'s league so inter-league records group in one query', () => {
  const ryanFinal = ctx.tables.team_games.find(row => row.season === 2022 && row.team === 'Ryan' && row.league === 'JFFL' && row.round === '5-Final');
  assert.ok(ryanFinal);
  assert.equal(ryanFinal.teamLeague, 'League One');
  assert.equal(ryanFinal.opponent, 'Tom');
  assert.equal(ryanFinal.opponentLeague, 'Premier');
  assert.equal(ryanFinal.crossLeague, 1);
  assert.equal(ryanFinal.win, 1);
  const sameLeague = ctx.tables.team_games.find(row => row.season === 2022 && row.team === 'Ryan' && row.opponent === 'J-Seitz');
  assert.equal(sameLeague?.teamLeague, 'League One');
  assert.equal(sameLeague?.opponentLeague, 'League One');
  assert.equal(sameLeague?.crossLeague, 0);
  const cup = ctx.tables.team_games.filter(row => row.league === 'JFFL');
  assert.ok(cup.length > 0 && cup.every(row => row.teamLeague != null && row.opponentLeague != null && row.crossLeague != null));
  const finals = query('team_games', {
    filters: [
      { field: 'league', op: 'eq', value: 'JFFL' },
      { field: 'round', op: 'eq', value: '5-Final' },
      { field: 'crossLeague', op: 'eq', value: 1 },
      { field: 'status', op: 'eq', value: 'final' },
    ],
    groupBy: ['teamLeague'],
    aggregates: [{ fn: 'sum', field: 'win', as: 'wins' }, { fn: 'sum', field: 'loss', as: 'losses' }, { fn: 'count', as: 'games' }],
  });
  assert.deepEqual(finals.rows.find(row => row.teamLeague === 'League One'), { teamLeague: 'League One', wins: 1, losses: 1, games: 2 });
  const premier = finals.rows.find(row => row.teamLeague === 'Premier');
  assert.equal(premier?.wins, 6);
  assert.equal(premier?.losses, 1);
});

// ---------- The season in progress ----------

const fixture = <T>(name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
const live = buildLiveSeason(fixture<SummaryMap>('week3-summaries.json'), fixture<RosterMap>('week3-rosters.json'))!;
const liveCtx = createContext({ ...archive, live });
const liveRun = (name: Parameters<typeof runDataTool>[1], args: Record<string, unknown>) => {
  const outcome = runDataTool(liveCtx, name, args);
  assert.equal(outcome.ok, true, outcome.ok ? '' : outcome.error);
  return outcome as { rows: Array<Record<string, unknown>>; caveats: string[]; summary?: Record<string, unknown> };
};

test('archive rows are final and live 2026 rows carry their status', () => {
  assert.ok(ctx.tables.team_games.every(row => row.status === 'final'));
  assert.equal(ctx.tables.player_weeks.length, 0);
  const rows = liveCtx.tables.team_games.filter(row => row.season === 2026);
  assert.equal(rows.length, live.games.length * 2);
  assert.ok(rows.some(row => row.status === 'live') && rows.some(row => row.status === 'final'));
  const seasons = liveCtx.tables.seasons.filter(row => row.season === 2026);
  assert.equal(seasons.length, 30);
  const sample = seasons[0];
  const played = rows.find(row => row.team === sample.team);
  assert.equal(played?.teamLeague, sample.league);
  assert.ok(seasons.every(row => row.status === 'live' && row.seasonChamp === null && row.topThree === null));
  assert.equal(liveCtx.tables.seasons.find(row => row.season === 2025)?.standing, liveCtx.tables.seasons.find(row => row.season === 2025)?.rankSeason);
});

test('a query spanning 2025 and 2026 returns both seasons and the live caveat', () => {
  const result = liveRun('query_games', {
    filters: [{ field: 'type', op: 'eq', value: 'Season' }, { field: 'season', op: 'between', value: '2025,2026' }],
    groupBy: ['season', 'status'], aggregates: [{ fn: 'count', as: 'games' }],
  });
  assert.deepEqual(result.rows.map(row => [row.season, row.status]), [[2025, 'final'], [2026, 'final'], [2026, 'live']]);
  assert.ok(result.caveats.some(text => /live scores as of/i.test(text)));
  const finals = liveRun('query_games', { filters: [{ field: 'season', op: 'eq', value: 2026 }, { field: 'status', op: 'eq', value: 'final' }], aggregates: [{ fn: 'count' }] });
  assert.equal(finals.caveats.some(text => /live scores/i.test(text)), false);
  const standings = liveRun('query_seasons', { filters: [{ field: 'season', op: 'eq', value: 2026 }, { field: 'standing', op: 'eq', value: 1 }], select: ['league', 'team', 'standing'] });
  assert.equal(standings.rows.length, 3);
  assert.ok(standings.caveats.some(text => text.includes('in progress')));
});

test('query_players aggregates player weeks and flags unknown slots', () => {
  const bench = liveRun('query_players', {
    filters: [{ field: 'week', op: 'eq', value: 3 }, { field: 'starter', op: 'eq', value: 0 }],
    groupBy: ['team'], aggregates: [{ fn: 'sum', field: 'points', as: 'benchPoints' }],
  });
  assert.deepEqual(bench.rows, [{ team: 'Jason', benchPoints: 15.2 }]);
  assert.ok(bench.caveats.some(text => /live scores/i.test(text)));
  const all = liveRun('query_players', { filters: [{ field: 'player', op: 'eq', value: 'Test Receiver' }] });
  assert.ok(all.caveats.some(text => text.includes('starter null')));
  const none = runDataTool(ctx, 'query_players', {});
  assert.equal(none.ok, false);
});

test('records, head to head, and careers only count finished 2026 results', () => {
  const baseBook = runDataTool(ctx, 'records', { book: 'weekly', kind: 'lowest' }) as { matched: number };
  const liveBook = liveRun('records', { book: 'weekly', kind: 'lowest' }) as unknown as { matched: number; caveats: string[] };
  const finishedWeeks = live.games.filter(game => game.type === 'Season' && game.status === 'final').length;
  assert.equal(finishedWeeks, 30);
  assert.equal(liveBook.matched - baseBook.matched, finishedWeeks);
  assert.ok(liveBook.caveats.some(text => text.includes('Live games are left out')));
  const base = runDataTool(ctx, 'head_to_head', { a: 'Donna', b: 'Jason' }) as { summary: { meetings: number } };
  const withLive = liveRun('head_to_head', { a: 'Donna', b: 'Jason' });
  const finished2026 = live.games.filter(game => game.type === 'Season' && game.status === 'final' && [game.teamA, game.teamB].sort().join() === 'Donna,Jason').length;
  assert.equal(withLive.summary!.meetings, base.summary.meetings + finished2026);
  const career = liveRun('manager_career', { name: 'Jason' });
  assert.equal(career.rows.at(-1)?.season, 2026);
  assert.ok(career.caveats.some(text => text.includes('2002 to 2025')));
  assert.deepEqual(career.summary, (runDataTool(ctx, 'manager_career', { name: 'Jason' }) as { summary: unknown }).summary);
  const titles = liveRun('title_years', { from: 2026, to: 2026 });
  assert.ok(titles.rows.length >= 3 && titles.rows.every(row => row.superBowl === null && row.bestRecord === null));
  assert.ok(titles.caveats.some(text => text.includes('in progress')));
});

test('complete answers stay whole, and finishes, matchups, and points against are computed', () => {
  const titles = runDataTool(ctx, 'title_years', {}) as { columns: Dataset['columns']; rows: Array<Record<string, unknown>>; caveats: string[]; truncated: boolean; matched: number };
  const seen = datasetForModel({ id: 'titles', title: 't', columns: titles.columns, rows: titles.rows, source: { tool: 'title_years', args: {} }, caveats: titles.caveats, truncated: titles.truncated, matched: titles.matched });
  assert.equal(seen.rows.length, titles.rows.length);
  assert.equal(seen.rows.length > 25, true);
  assert.equal('note' in seen, false);
  assert.equal(titles.rows.find(row => row.season === 2022 && row.league === 'League One')?.jfflCup, 'Ryan');

  const finals = query('team_games', {
    filters: [{ field: 'league', op: 'eq', value: 'JFFL' }, { field: 'round', op: 'eq', value: '5-Final' }],
    aggregates: [{ fn: 'count_distinct', field: 'gameId', as: 'games' }, { fn: 'count', as: 'sides' }],
  });
  assert.deepEqual(finals.rows[0], { games: 13, sides: 26 });
  const ryan = ctx.tables.team_games.find(row => row.season === 2022 && row.team === 'Ryan' && row.round === '5-Final' && row.league === 'JFFL');
  const tom = ctx.tables.team_games.find(row => row.gameId === ryan?.gameId && row.team === 'Tom');
  assert.equal(ryan?.opponent, 'Tom');
  assert.equal(tom?.gameId, ryan?.gameId);
  assert.equal(ryan?.betterFinish, null);

  const ahead = ctx.tables.team_games.find(row => row.type === 'Season' && row.betterFinish === 1);
  assert.ok(ahead && ahead.crossLeague === 0 && (ahead.teamFinish as number) < (ahead.opponentFinish as number));
  assert.equal(ctx.tables.team_games.find(row => row.gameId === ahead?.gameId && row.team === ahead?.opponent)?.betterFinish, 0);

  assert.equal(ctx.tables.seasons.find(row => row.season === 2002 && row.team === 'Jason')?.pointsAgainst, null);
  const allowed = ctx.tables.seasons.find(row => row.season === 2022 && row.team === 'Ryan')?.pointsAgainst;
  assert.equal(typeof allowed, 'number');
  assert.ok((allowed as number) > 0);
  const summed = query('seasons', { filters: [{ field: 'team', op: 'eq', value: 'Jason' }], aggregates: [{ fn: 'sum', field: 'pointsAgainst', as: 'allowed' }] });
  assert.ok(summed.caveats.some(text => text.includes('no pointsAgainst')));

  const series = runDataTool(ctx, 'head_to_head', { a: 'Ryan', b: 'Tom' }) as { rows: Array<Record<string, unknown>>; summary: { cup: { RyanWins: number } } };
  assert.equal(series.rows.find(row => row.season === 2022 && row.type === 'Cup' && row.when === 'final')?.winner, 'Ryan');
  assert.ok(series.summary.cup.RyanWins >= 1);
  assert.equal(liveCtx.tables.team_games.find(row => row.season === 2026)?.teamFinish, null);
});
