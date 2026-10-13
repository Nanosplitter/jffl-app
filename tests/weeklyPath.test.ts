import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordBookId, rivalPath, roundSlug } from '../src/sharePaths.ts';
import { historyWeek, weeklyWeek } from '../src/weeklyPath.ts';

test('a weekly path keeps a finished week and the current week', () => {
  assert.equal(weeklyWeek('4', 6), 4);
  assert.equal(weeklyWeek('6', 6), 6);
  assert.equal(weeklyWeek(undefined, 6), 6);
  assert.equal(weeklyWeek('9', 6), 6);
  assert.equal(weeklyWeek('0', 6), 6);
  assert.equal(weeklyWeek('4', 0), 4);
  assert.equal(weeklyWeek(undefined, 0), 0);
});

test('record books, cup rounds, and rivalries are path segments', () => {
  assert.equal(recordBookId('jffl'), 'jffl');
  assert.equal(recordBookId('nope'), 'weekly');
  assert.equal(roundSlug('First round'), 'first-round');
  assert.equal(roundSlug('Round 2'), 'round-2');
  assert.equal(rivalPath('SeanT', 'Wayne'), '/archive/rivals/SeanT/Wayne');
});

test('a week in history stays between 1 and 14', () => {
  assert.equal(historyWeek('4'), 4);
  assert.equal(historyWeek(undefined), 5);
  assert.equal(historyWeek('15'), 5);
  assert.equal(historyWeek('0'), 5);
});
