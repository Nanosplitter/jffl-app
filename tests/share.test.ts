import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseAnswer } from '../src/history/answerText.ts';
import { createSession, datasetOf, executeTool } from '../src/history/askRuntime.ts';
import { resolveChart } from '../src/history/chartBuild.ts';
import { LIGHT_THEME, createColorMap } from '../src/history/chartKit.ts';
import { archiveStamp, buildShare, cleanControls, decodeShare, encodeShare, MAX_ENCODED, packChart, shareUrl, type SharePayload } from '../src/history/share.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);

function sample() {
  const session = createSession(archive);
  const query = executeTool(session, 'query_games', {
    filters: [{ field: 'type', op: 'eq', value: 'Season' }], groupBy: ['season'], aggregates: [{ fn: 'mean', field: 'score', as: 'avg' }], sort: [{ field: 'season', dir: 'asc' }],
  });
  const chart = executeTool(session, 'render_chart', { type: 'line', title: 'Average score', datasetId: query.dataset!.id, x: 'season', y: ['avg'] });
  assert.ok(chart.chart);
  const recipe = executeTool(session, 'render_chart', { type: 'draft_slot_curve', title: 'Draft slots' });
  assert.ok(recipe.chart);
  const payload: SharePayload = {
    v: 1, a: archiveStamp(archive), q: 'How has scoring changed?', t: 'Scoring went up after 2013.',
    c: [packChart(session, chart.chart!.spec, { from: 2010, leagues: ['Premier'] }), packChart(session, recipe.chart!.spec)],
  };
  return { session, payload };
}

test('a shared chart round-trips and rebuilds the same numbers without stored rows', async () => {
  const { payload } = sample();
  const encoded = await encodeShare(payload);
  assert.ok(encoded.length < MAX_ENCODED);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  const decoded = await decodeShare(`#${encoded}`);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.payload.c[0].controls, { from: 2010, leagues: ['Premier'] });
  const built = buildShare(archive, decoded.payload);
  assert.equal(built.skipped, 0);
  assert.equal(built.stale, false);
  assert.equal(built.charts.length, 2);
  assert.equal(built.question, 'How has scoring changed?');
  assert.equal(built.text, 'Scoring went up after 2013.');
  assert.ok(!JSON.stringify(decoded.payload).includes('"rows"'), 'no rows travel in the link; datasets are rebuilt from queries');
  assert.ok(encoded.length < 2500);
});

test('rebuilt charts match the original chart table', async () => {
  const { session, payload } = sample();
  const decoded = await decodeShare(await encodeShare(payload));
  assert.ok(decoded.ok);
  if (!decoded.ok) return;
  const built = buildShare(archive, decoded.payload);
  const color = createColorMap(() => LIGHT_THEME.palette);
  const original = resolveChart(payload.c[0].spec, { dataset: id => datasetOf(session, id), archive, theme: LIGHT_THEME, color });
  const rebuilt = resolveChart(built.charts[0].spec, { dataset: id => datasetOf(built.session, id), archive, theme: LIGHT_THEME, color });
  assert.deepEqual(rebuilt.table, original.table);
});

test('links with damaged, oversized, or foreign content are refused', async () => {
  const { payload } = sample();
  const encoded = await encodeShare(payload);
  for (const text of ['', '#', 'not*base64', 'AAAA', encoded.slice(0, 20), `${encoded}zz`]) {
    const result = await decodeShare(text);
    assert.equal(result.ok, false, text);
  }
  assert.equal((await decodeShare('A'.repeat(MAX_ENCODED + 1))).ok, false);
  await assert.rejects(encodeShare({ ...payload, t: 'x', c: [{ ...payload.c[0], spec: { ...payload.c[0].spec, title: 'T', option: { big: 'z'.repeat(60_000).split('').map((_, index) => `${index}${Math.random()}`) } } }] }), /too large/);
});

test('wrong versions, unknown tools, and hostile fields are refused', async () => {
  const { payload } = sample();
  const wrongVersion = await encodeShare({ ...payload, v: 2 as never });
  assert.equal((await decodeShare(wrongVersion)).ok, false);
  const unknownTool = await encodeShare({ ...payload, c: [{ ...payload.c[0], sources: [{ id: 'ds1', source: { tool: 'drop_everything', args: {} } }] }] });
  assert.equal((await decodeShare(unknownTool)).ok, false);
  const badId = await encodeShare({ ...payload, c: [{ ...payload.c[0], sources: [{ id: '../x', source: { tool: 'query_games', args: {} } }] }] });
  assert.equal((await decodeShare(badId)).ok, false);
  const hugeArgs = await encodeShare({ ...payload, c: [{ ...payload.c[0], sources: [{ id: 'ds1', source: { tool: 'query_games', args: { limit: 5, filters: Array.from({ length: 300 }, (_, index) => ({ field: 'team', op: 'eq', value: `Person${index}` })) } } }] }] });
  assert.equal((await decodeShare(hugeArgs)).ok, false);
});

test('a chart that no longer validates is dropped instead of crashing the page', async () => {
  const { payload } = sample();
  const broken: SharePayload = { ...payload, c: [{ ...payload.c[0], spec: { ...payload.c[0].spec, y: ['nope'] } }, payload.c[1]] };
  const decoded = await decodeShare(await encodeShare(broken));
  assert.ok(decoded.ok);
  if (!decoded.ok) return;
  const built = buildShare(archive, decoded.payload);
  assert.equal(built.skipped, 1);
  assert.equal(built.charts.length, 1);
  assert.equal(built.charts[0].spec.type, 'draft_slot_curve');
});

test('a chart cannot borrow another chart\u2019s data by guessing its dataset id', async () => {
  const { payload } = sample();
  const sneaky: SharePayload = {
    ...payload,
    c: [payload.c[0], { ...payload.c[0], sources: [], spec: { ...payload.c[0].spec, datasetId: 'ds100' } }],
  };
  const decoded = await decodeShare(await encodeShare(sneaky));
  assert.ok(decoded.ok);
  if (!decoded.ok) return;
  const built = buildShare(archive, decoded.payload);
  assert.equal(built.charts.length, 1);
  assert.equal(built.skipped, 1);
});

test('links from an older archive are flagged', async () => {
  const { payload } = sample();
  const decoded = await decodeShare(await encodeShare({ ...payload, a: '1-1' }));
  assert.ok(decoded.ok);
  if (decoded.ok) assert.equal(buildShare(archive, decoded.payload).stale, true);
});

test('controls from a link are limited to known values', () => {
  assert.deepEqual(cleanControls({ from: 2010, to: 3000, leagues: ['Premier', 'Mars'], types: ['Cup', 'x'], excludeTwoWeek: true, extra: 1 }), { from: 2010, leagues: ['Premier'], types: ['Cup'], excludeTwoWeek: true });
  assert.equal(cleanControls({ from: 'x' }), undefined);
  assert.equal(cleanControls(null), undefined);
});

test('share urls keep the data in the fragment', () => {
  assert.equal(shareUrl('https://example.test', 'abc'), 'https://example.test/archive/ask/share#abc');
});

test('answer text becomes safe blocks: paragraphs, lists, bold, and nothing executable', () => {
  const blocks = parseAnswer('Jeff won **four** titles.\nHe is first.\n\n- Becky: 3\n- Donna: 2\n\n<script>alert(1)</script>');
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], { type: 'p', inline: [{ text: 'Jeff won ', bold: false }, { text: 'four', bold: true }, { text: ' titles. He is first.', bold: false }] });
  assert.equal(blocks[1].type, 'ul');
  assert.equal((blocks[1] as { items: unknown[] }).items.length, 2);
  assert.deepEqual(blocks[2], { type: 'p', inline: [{ text: '<script>alert(1)</script>', bold: false }] });
});
