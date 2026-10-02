import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAgent, type ModelContent } from '../src/history/askAgent.ts';
import { GOLDEN, unsupportedNumbers } from '../src/history/askEval.ts';
import { createMockModel } from '../src/history/askMock.ts';
import { createSession } from '../src/history/askRuntime.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);
const session = createSession(archive);

test('every golden question has ground truth computed from the archive', () => {
  assert.ok(GOLDEN.length >= 15);
  assert.equal(new Set(GOLDEN.map(item => item.id)).size, GOLDEN.length);
  for (const item of GOLDEN) {
    assert.ok(item.turns.length >= 1 && item.turns.every(turn => turn.length <= 200), item.id);
    assert.ok(item.contains || item.matches || item.charts || item.tools || item.noCharts, `${item.id} checks nothing`);
    for (const group of item.contains?.(session) ?? []) {
      assert.ok(group.length > 0 && group.every(entry => entry && entry !== 'undefined' && entry !== 'null'), `${item.id} has an empty ground truth`);
    }
  }
});

test('ground truth agrees with figures established in the query tests', () => {
  const byId = new Map(GOLDEN.map(item => [item.id, item]));
  assert.deepEqual(byId.get('head-to-head')!.contains!(session), [['0'], ['14']]);
  assert.ok(byId.get('highest-weekly-score')!.contains!(session)[1].includes('170'));
  const eras = byId.get('scoring-eras')!.contains!(session);
  assert.equal(eras[0][0], '65.4');
  assert.equal(eras[1][0], '88.1');
  assert.deepEqual(byId.get('best-record-super-bowl')!.contains!(session)[0], ['7']);
});

test('numbers that no tool returned are flagged, rounded ones are not', async () => {
  const contents: ModelContent[] = [];
  const result = await runAgent({ model: createMockModel(), session: createSession(archive), contents, message: 'Show the highest scores ever' });
  const top = JSON.stringify(contents).match(/"score":(\d+(?:\.\d+)?)/)?.[1];
  assert.ok(top);
  assert.deepEqual(unsupportedNumbers(`The top score is ${top}.`, contents, 'Show the highest scores ever'), []);
  assert.deepEqual(unsupportedNumbers('The top score is 9999.', contents), [9999]);
  assert.deepEqual(unsupportedNumbers('Follow-ups: Show 1234 more', contents), []);
  assert.ok(result.text.length > 0);
  assert.deepEqual(unsupportedNumbers('Roughly 65.4 points', [{ role: 'user', parts: [{ functionResponse: { name: 'x', response: { mean: 65.4321 } } }] }]), []);
});
