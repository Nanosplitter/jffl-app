import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createSession, executeTool, validationEnv } from '../src/history/askRuntime.ts';
import { resolveChart } from '../src/history/chartBuild.ts';
import { LIGHT_THEME, createColorMap, csvOf } from '../src/history/chartKit.ts';
import { datasetIdsOf, normalizeModelSpec, sanitizeOption, validateSpec, type ChartSpec } from '../src/history/chartSpec.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);
const session = createSession(archive);
const env = validationEnv(session);
const color = createColorMap(() => LIGHT_THEME.palette);
const build = { dataset: env.dataset, archive, theme: LIGHT_THEME, color };

const scoring = executeTool(session, 'query_games', {
  filters: [{ field: 'type', op: 'eq', value: 'Season' }, { field: 'season', op: 'gte', value: 2013 }],
  groupBy: ['season', 'league'], aggregates: [{ fn: 'mean', field: 'score', as: 'mean' }, { fn: 'count', as: 'games' }],
});
const scoringId = scoring.dataset!.id;
const bySeason = executeTool(session, 'query_games', { filters: [{ field: 'type', op: 'eq', value: 'Season' }], groupBy: ['season'], aggregates: [{ fn: 'mean', field: 'score', as: 'mean' }] }).dataset!.id;
const managers = executeTool(session, 'query_seasons', { filters: [{ field: 'team', op: 'in', value: 'Jeff,Becky,Donna' }], groupBy: ['team'], aggregates: [{ fn: 'sum', field: 'seasonChamp', as: 'titles' }, { fn: 'sum', field: 'superBowlChamp', as: 'bowls' }, { fn: 'mean', field: 'pointsPerWeek', as: 'ppw' }, { fn: 'count', as: 'seasons' }] }).dataset!.id;
const scatterId = executeTool(session, 'query_seasons', { filters: [{ field: 'draft', op: 'not_null' }, { field: 'points', op: 'not_null' }], select: ['team', 'season', 'draft', 'points'], limit: 80 }).dataset!.id;
const boxId = executeTool(session, 'query_games', { filters: [{ field: 'type', op: 'eq', value: 'Season' }, { field: 'season', op: 'gte', value: 2020 }], select: ['season', 'score'], limit: 1000 }).dataset!.id;

function good(spec: Record<string, unknown>) {
  const result = validateSpec(normalizeModelSpec(spec), env);
  assert.equal(result.ok, true, result.ok ? '' : result.errors.join('; '));
  if (!result.ok) throw new Error('unreachable');
  return result.spec;
}

test('typed specs validate and build charts for every chart type', () => {
  const specs: Array<Record<string, unknown>> = [
    { type: 'line', title: 'Scores', datasetId: bySeason, x: 'season', y: 'mean' },
    { type: 'area', title: 'Scores', datasetId: bySeason, x: 'season', y: ['mean'] },
    { type: 'line', title: 'By league', datasetId: scoringId, x: 'season', series: 'league', y: ['mean'], highlight: 'Premier' },
    { type: 'bar', title: 'Titles', datasetId: managers, x: 'team', y: ['titles'], sort: 'y_desc' },
    { type: 'bar', title: 'Titles sideways', datasetId: managers, x: 'team', y: ['titles'], horizontal: true },
    { type: 'stacked_bar', title: 'Honors', datasetId: managers, x: 'team', y: ['titles', 'bowls'] },
    { type: 'scatter', title: 'Draft vs points', datasetId: scatterId, x: 'draft', y: ['points'], label: 'team' },
    { type: 'heatmap', title: 'Heat', datasetId: scoringId, x: 'season', series: 'league', value: 'mean' },
    { type: 'radar', title: 'Radar', datasetId: managers, label: 'team', y: ['titles', 'bowls', 'ppw', 'seasons'] },
    { type: 'boxplot', title: 'Spread', datasetId: boxId, x: 'season', y: ['score'] },
    { type: 'table', title: 'Table', datasetId: managers },
    { type: 'stat_cards', title: 'Cards', datasetId: managers, label: 'team', value: 'titles' },
    { type: 'rank_over_time', title: 'Rank', datasetId: scoringId, x: 'season', series: 'league', y: ['games'] },
  ];
  for (const raw of specs) {
    const spec = good(raw);
    const chart = resolveChart(spec, build);
    assert.ok(chart.summary.length > 0, `${spec.type} summary`);
    assert.ok(chart.table.columns.length > 0, `${spec.type} table`);
    if (chart.kind === 'echarts') assert.ok(Array.isArray((chart.option as { series: unknown[] }).series), `${spec.type} series`);
  }
});

test('unknown data is never charted as zero', () => {
  const sparse = executeTool(session, 'query_seasons', { filters: [{ field: 'team', op: 'eq', value: 'Jeff' }], select: ['season', 'jfflRank'], limit: 40 }).dataset!.id;
  const chart = resolveChart(good({ type: 'line', title: 'JFFL Cup finish', datasetId: sparse, x: 'season', y: ['jfflRank'] }), build);
  const values = ((chart.option as { series: Array<{ data: Array<number | null> }> }).series[0]).data;
  assert.ok(values.includes(null));
  assert.equal(values.includes(0), false);
});

test('bad specs explain what to fix', () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ type: 'line', title: 'x', datasetId: 'ds999', x: 'season', y: ['mean'] }, /Unknown datasetId/],
    [{ type: 'line', title: 'x', datasetId: bySeason, x: 'nope', y: ['mean'] }, /not a column/],
    [{ type: 'line', title: 'x', datasetId: scoringId, x: 'season', y: ['league'] }, /must be numeric/],
    [{ type: 'pie', title: 'x' }, /Unknown chart type/],
    [{ type: 'line', datasetId: bySeason, x: 'season', y: ['mean'] }, /title/],
    [{ type: 'line', title: 'x', datasetId: scoringId, x: 'season', series: 'league', y: ['mean', 'games'] }, /either a series column/],
    [{ type: 'radar', title: 'x', datasetId: managers, label: 'team', y: ['titles'] }, /3 to 8/],
    [{ type: 'bar', title: '<img src=x onerror=alert(1)>', datasetId: managers, x: 'team', y: ['titles'] }, /markup/],
    [{ type: 'career_timeline', title: 'x', params: { manager: 'Nobody' } }, /Unknown manager/],
    [{ type: 'h2h_scoreboard', title: 'x', params: { a: 'Jeff', b: 'jeff' } }, /two different managers/],
    [{ type: 'season_race', title: 'x', params: {} }, /season/],
  ];
  for (const [spec, pattern] of cases) {
    const result = validateSpec(normalizeModelSpec(spec), env);
    assert.equal(result.ok, false, JSON.stringify(spec));
    assert.match((result as { errors: string[] }).errors.join(' '), pattern);
  }
});

test('the option sanitizer removes markup, links, and unsupported pieces', () => {
  const dirty = {
    title: { text: 'Fine', link: 'http://example.com' },
    toolbox: { feature: { saveAsImage: {} } },
    tooltip: { formatter: '<b>{b}</b>', extraCssText: 'x' },
    xAxis: { type: 'category', data: ['a', 'b'], axisLabel: { formatter: '{value} pts' } },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [1, 2], symbol: 'image://http://evil.test/x.png', name: 'ok' }],
    evil: { x: 1 },
  };
  const result = sanitizeOption(JSON.stringify(dirty), env);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const option = result.value.option as Record<string, any>;
  assert.equal(option.toolbox, undefined);
  assert.equal(option.evil, undefined);
  assert.equal(option.title.link, undefined);
  assert.equal(option.tooltip.formatter, undefined);
  assert.equal(option.tooltip.extraCssText, undefined);
  assert.equal(option.series[0].symbol, undefined);
  assert.equal(option.xAxis.axisLabel.formatter, '{value} pts');
  assert.ok(result.value.warnings.length >= 4);
});

test('the option sanitizer rejects bad series, bad JSON, oversize input, and unknown bindings', () => {
  assert.equal(sanitizeOption('{nope', env).ok, false);
  assert.equal(sanitizeOption({ series: [{ type: 'graph', data: [] }] }, env).ok, false);
  assert.equal(sanitizeOption({ xAxis: {} }, env).ok, false);
  assert.equal(sanitizeOption('{"series":[{"type":"bar","data":"' + 'x'.repeat(30000) + '"}]}', env).ok, false);
  assert.equal(sanitizeOption({ series: [{ type: 'bar', data: { $data: 'ds999.mean' } }] }, env).ok, false);
  assert.equal(sanitizeOption({ series: [{ type: 'bar', data: { $data: `${bySeason}.zzz` } }] }, env).ok, false);
  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let i = 0; i < 15; i += 1) { cursor.a = {}; cursor = cursor.a as Record<string, unknown>; }
  assert.equal(sanitizeOption({ series: [{ type: 'bar', data: [1], itemStyle: deep }] }, env).ok, false);
});

test('data bindings stay as references in specs and expand when drawn', () => {
  const option = { xAxis: { type: 'category', data: { $data: `${bySeason}.season` } }, yAxis: { type: 'value' }, series: [{ type: 'line', data: { $data: `${bySeason}.mean` } }] };
  const spec = good({ type: 'echarts', title: 'Custom', optionJson: JSON.stringify(option) }) as ChartSpec;
  assert.deepEqual((spec.option as any).series[0].data, { $data: `${bySeason}.mean` });
  assert.deepEqual(datasetIdsOf(spec), [bySeason]);
  const chart = resolveChart(spec, build);
  const series = (chart.option as any).series[0].data as number[];
  assert.ok(series.length > 20);
  assert.ok(chart.table.rows.length > 20);
  const rows = sanitizeOption({ series: [{ type: 'scatter', data: { $rows: `${bySeason}.season,mean` } }] }, env);
  assert.equal(rows.ok && Array.isArray((rows.value.option as any).series[0].data[0]), true);
});

test('every recipe builds a chart from the real archive', () => {
  const recipes: Array<Record<string, unknown>> = [
    { type: 'rivalry_matrix', title: 'Rivals' },
    { type: 'rivalry_matrix', title: 'Rivals', params: { managers: ['jeff', 'Becky', 'Donna', 'SeanT'], from: 2013 } },
    { type: 'season_race', title: 'Race', params: { season: 2019, league: 'Championship' } },
    { type: 'season_race', title: 'Race', params: { season: 2008 } },
    { type: 'career_timeline', title: 'Jeff', params: { manager: 'jeff' } },
    { type: 'trophy_wall', title: 'Trophies' },
    { type: 'scoring_distribution', title: 'Spread' },
    { type: 'scoring_distribution', title: 'Spread', params: { managers: ['Jeff', 'Becky'], from: 2013, bin: 15 } },
    { type: 'draft_slot_curve', title: 'Draft' },
    { type: 'h2h_scoreboard', title: 'Becky vs Jeff', params: { a: 'Becky', b: 'Jeff' } },
  ];
  for (const raw of recipes) {
    const chart = resolveChart(good(raw), build);
    assert.equal(chart.kind === 'table' && chart.table.rows.length === 0, false, `${raw.type} produced nothing`);
    assert.ok(chart.summary.length > 10);
    assert.ok(chart.caveats.length > 0);
  }
  const h2h = resolveChart(good({ type: 'h2h_scoreboard', title: 'x', params: { a: 'Becky', b: 'Jeff' } }), build);
  assert.deepEqual(h2h.cards?.map(card => card.value), ['0', '14', '0', '14']);
  const wall = resolveChart(good({ type: 'trophy_wall', title: 'x' }), build);
  assert.equal(wall.table.rows[0][0], 'Jeff');
});

test('a named y axis gets room above the plot, so its label is never clipped', () => {
  const topOf = (chart: ReturnType<typeof resolveChart>) => (chart.option as { grid: { top: number } }).grid.top;
  const h2h = resolveChart(good({ type: 'h2h_scoreboard', title: 'Jeff vs Jason', params: { a: 'Jeff', b: 'Jason' } }), build);
  assert.ok(topOf(h2h) >= 36);
  const scatter = resolveChart(good({ type: 'scatter', title: 'Draft vs points', datasetId: scatterId, x: 'draft', y: ['points'] }), build);
  assert.ok(topOf(scatter) >= 36);
  const legend = resolveChart(good({ type: 'line', title: 'Scoring', datasetId: scoringId, x: 'season', y: ['mean'], series: 'league' }), build);
  const named = ((legend.option as { yAxis: { name?: string } }).yAxis).name;
  if (named) assert.ok(topOf(legend) >= 64);
});

test('recipes handle empty results with a plain message', () => {
  const none = resolveChart(good({ type: 'season_race', title: 'x', params: { season: 2002, league: 'Premier' } }), build);
  assert.equal(none.kind, 'table');
  assert.match(none.summary, /No regular-season games/);
});

test('the rivalry matrix keeps ties out of win percentages and blanks missing pairs', () => {
  const chart = resolveChart(good({ type: 'rivalry_matrix', title: 'x', params: { managers: ['Becky', 'Jeff'] } }), build);
  const rows = chart.table.rows;
  const beckyRow = rows.find(row => row[0] === 'Becky')!;
  const jeffRow = rows.find(row => row[0] === 'Jeff')!;
  assert.equal(beckyRow[chart.table.columns.indexOf('Jeff')], 0);
  assert.equal(jeffRow[chart.table.columns.indexOf('Becky')], 100);
  assert.equal(beckyRow[chart.table.columns.indexOf('Becky')], null);
});

test('tables export to CSV with quoting', () => {
  const csv = csvOf({ columns: ['name', 'note'], rows: [['A, B', 'say "hi"'], ['C', null]] });
  assert.equal(csv, 'name,note\r\n"A, B","say ""hi"""\r\nC,');
});
