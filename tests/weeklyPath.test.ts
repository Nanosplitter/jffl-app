import assert from 'node:assert/strict';
import { test } from 'node:test';
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

test('a week in history stays between 1 and 14', () => {
  assert.equal(historyWeek('4'), 4);
  assert.equal(historyWeek(undefined), 5);
  assert.equal(historyWeek('15'), 5);
  assert.equal(historyWeek('0'), 5);
});
