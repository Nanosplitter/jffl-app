import assert from 'node:assert/strict';
import test from 'node:test';
import { kickoffLabel } from '../src/kickoff.ts';
import { pendingPlayLabel } from '../src/byeWeeks.ts';

test('formats an Eastern kickoff as time and day', () => {
  assert.equal(kickoffLabel('2026-10-18T20:25:00Z'), '4:25pm SUN');
  assert.equal(kickoffLabel('2026-10-16T00:15:00Z'), '8:15pm THU');
  assert.equal(kickoffLabel('2026-01-11T18:00:00Z'), '1:00pm SUN');
});

test('a bye replaces the kickoff', () => {
  assert.equal(pendingPlayLabel('MIN', 6, null), 'Bye');
  assert.equal(pendingPlayLabel('DET', 6, '4:25pm SUN'), 'Bye');
  assert.equal(pendingPlayLabel('GB', 6, null), 'Yet to play');
  assert.equal(pendingPlayLabel('GB', 6, '4:25pm SUN'), '4:25pm SUN');
});

test('leaves a missing kickoff blank', () => {
  assert.equal(kickoffLabel(null), null);
  assert.equal(kickoffLabel(undefined), null);
  assert.equal(kickoffLabel('not a time'), null);
});
