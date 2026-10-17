import assert from 'node:assert/strict';
import test from 'node:test';
import { kickoffLabel } from '../src/kickoff.ts';

test('formats an Eastern kickoff as time and day', () => {
  assert.equal(kickoffLabel('2026-10-18T20:25:00Z'), '4:25pm SUN');
  assert.equal(kickoffLabel('2026-10-16T00:15:00Z'), '8:15pm THU');
  assert.equal(kickoffLabel('2026-01-11T18:00:00Z'), '1:00pm SUN');
});

test('leaves a missing kickoff blank', () => {
  assert.equal(kickoffLabel(null), null);
  assert.equal(kickoffLabel(undefined), null);
  assert.equal(kickoffLabel('not a time'), null);
});
