import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseAnswer } from '../src/history/answerText.ts';
import { createSession, datasetOf, executeTool } from '../src/history/askRuntime.ts';
import { resolveChart } from '../src/history/chartBuild.ts';
import { LIGHT_THEME, createColorMap } from '../src/history/chartKit.ts';
import { buildLiveSeason } from '../src/history/liveSeason.ts';
import { archiveStamp, buildShare, cleanControls, decodeShare, encodeShare, MAX_ENCODED, packChart, shareUrl, usesLiveData, type SharePayload } from '../src/history/share.ts';
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
  // A few bytes after a finished deflate stream still decode on some Node versions, so that case is not asserted.
  for (const text of ['', '#', 'not*base64', 'AAAA', encoded.slice(0, 20)]) {
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

test('charts on the season in progress carry the snapshot time and rebuild from the current snapshot', async () => {
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
  const live = buildLiveSeason(fixture('week3-summaries.json'), fixture('week3-rosters.json'))!;
  const liveArchive = { ...archive, live };
  const session = createSession(liveArchive);
  const query = executeTool(session, 'query_games', {
    filters: [{ field: 'season', op: 'eq', value: 2026 }, { field: 'type', op: 'eq', value: 'Season' }], groupBy: ['team'], aggregates: [{ fn: 'sum', field: 'score', as: 'points' }],
  });
  const chart = executeTool(session, 'render_chart', { type: 'bar', title: '2026 points', datasetId: query.dataset!.id, x: 'team', y: ['points'] });
  assert.ok(chart.chart);
  assert.equal(usesLiveData(session, [chart.chart!.spec]), true);
  assert.equal(usesLiveData(sample().session, sample().payload.c.map(item => item.spec)), false);
  const decoded = await decodeShare(await encodeShare({ v: 1, a: archiveStamp(liveArchive), l: live.asOf!, c: [packChart(session, chart.chart!.spec)] }));
  assert.ok(decoded.ok);
  if (!decoded.ok) return;
  assert.equal(decoded.payload.l, live.asOf);
  const later = { ...live, asOf: '2026-09-29T02:00:00+00:00' };
  const built = buildShare({ ...archive, live: later }, decoded.payload);
  assert.equal(built.charts.length, 1);
  assert.equal(built.stale, false);
  assert.equal(built.liveAsOf, live.asOf);
  const damaged = await decodeShare(await encodeShare({ v: 1, a: '1-1', l: 'x'.repeat(60), c: decoded.payload.c } as SharePayload));
  assert.equal(damaged.ok, false);
});

test('share urls keep the data in the fragment', () => {
  assert.equal(shareUrl('https://example.test', 'abc'), 'https://example.test/archive/ask/share#abc');
});

test('answer text becomes safe blocks: paragraphs, lists, bold, and nothing executable', () => {
  const blocks = parseAnswer('Jeff won **four** titles.\nHe is first.\n\n- Becky: 3\n- Donna: 2\n\n<script>alert(1)</script>');
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], { type: 'p', inline: [{ text: 'Jeff', bold: false, color: 'premier' }, { text: ' won ', bold: false }, { text: 'four', bold: true }, { text: ' titles. He is first.', bold: false }] });
  assert.equal(blocks[1].type, 'ul');
  if (blocks[1].type === 'ul') {
    assert.equal(blocks[1].items[0][0].color, 'championship');
    assert.equal(blocks[1].items[1][0].color, 'premier');
  }
  assert.deepEqual(blocks[2], { type: 'p', inline: [{ text: '<script>alert(1)</script>', bold: false }] });
});

test('color tags become ink runs, and unknown or unclosed tags stay text', () => {
  const blocks = parseAnswer('{premier}Premier{/premier} beat {championship}**Championship**{/championship}.\n\n- {league-one}League One{/league-one}: {red}low{/red}\n\n{green}nope{/green} {premier}open');
  assert.deepEqual(blocks[0], {
    type: 'p',
    inline: [
      { text: 'Premier', bold: false, color: 'premier' },
      { text: ' beat ', bold: false },
      { text: 'Championship', bold: true, color: 'championship' },
      { text: '.', bold: false },
    ],
  });
  assert.equal(blocks[1].type, 'ul');
  if (blocks[1].type === 'ul') {
    assert.deepEqual(blocks[1].items[0], [
      { text: 'League One', bold: false, color: 'league-one' },
      { text: ': low', bold: false },
    ]);
  }
  assert.deepEqual(blocks[2], { type: 'p', inline: [{ text: '{green}nope{/green} {premier}open', bold: false }] });
});

test('a mismatched color close is removed and the opening color is kept', () => {
  const blocks = parseAnswer('{championship}Championship League Cup{/premier} (Quarterfinals)\n\n- {#8}{championship}Jasmin{/premier} topped {#1}SeanT, 140–93\n\n{league-one}League One Cup{/premier}\n\n{/premier} {premier}open');
  assert.equal(blocks[0].type, 'p');
  if (blocks[0].type === 'p') {
    assert.deepEqual(blocks[0].inline, [
      { text: 'Championship League Cup', bold: false, color: 'championship' },
      { text: ' (Quarterfinals)', bold: false },
    ]);
  }
  assert.equal(blocks[1].type, 'ul');
  if (blocks[1].type === 'ul') {
    assert.deepEqual(blocks[1].items[0], [
      { text: '8', bold: false, mark: true },
      { text: 'Jasmin', bold: false, color: 'championship' },
      { text: ' topped ', bold: false },
      { text: '1', bold: false, mark: true },
      { text: 'SeanT', bold: false, color: 'championship' },
      { text: ', 140–93', bold: false },
    ]);
  }
  assert.equal(blocks[2].type, 'p');
  if (blocks[2].type === 'p') {
    assert.deepEqual(blocks[2].inline, [
      { text: 'League One Cup', bold: false, color: 'league-one' },
    ]);
  }
  assert.deepEqual(blocks[3], { type: 'p', inline: [{ text: ' {premier}open', bold: false }] });
});

test('a current manager keeps their league color when another color was chosen', () => {
  const blocks = parseAnswer('Jason beat Al. {orange}SeanH{/orange} and {league-one}Michael{/league-one} stayed put.');
  assert.equal(blocks[0].type, 'p');
  if (blocks[0].type === 'p') {
    assert.deepEqual(blocks[0].inline, [
      { text: 'Jason', bold: false, color: 'premier' },
      { text: ' beat ', bold: false },
      { text: 'Al', bold: false, color: 'league-one' },
      { text: '. ', bold: false },
      { text: 'SeanH', bold: false, color: 'championship' },
      { text: ' and ', bold: false },
      { text: 'Michael', bold: false, color: 'championship' },
      { text: ' stayed put.', bold: false },
    ]);
  }
});

test('a place mark becomes a raised number in front of the name, and a bad mark stays text', () => {
  const blocks = parseAnswer('{#2}Jason leads. {premier}{#7}Jeff{/premier} is the other bye. {#0}Nope {#41}Nope');
  assert.equal(blocks[0].type, 'p');
  if (blocks[0].type === 'p') {
    assert.deepEqual(blocks[0].inline, [
      { text: '2', bold: false, mark: true },
      { text: 'Jason', bold: false, color: 'premier' },
      { text: ' leads. ', bold: false },
      { text: '7', bold: false, mark: true },
      { text: 'Jeff', bold: false, color: 'premier' },
      { text: ' is the other bye. {#0}Nope {#41}Nope', bold: false },
    ]);
  }
});

test('a league name left untagged still takes its color, and a league tag wins', () => {
  const blocks = parseAnswer('2018 Premier and the Premier League. {championship}Premier{/championship} stayed blue. Not championships.');
  assert.equal(blocks[0].type, 'p');
  if (blocks[0].type === 'p') {
    assert.deepEqual(blocks[0].inline, [
      { text: '2018 ', bold: false },
      { text: 'Premier', bold: false, color: 'premier' },
      { text: ' and the ', bold: false },
      { text: 'Premier League', bold: false, color: 'premier' },
      { text: '. ', bold: false },
      { text: 'Premier', bold: false, color: 'championship' },
      { text: ' stayed blue. Not championships.', bold: false },
    ]);
  }
});
