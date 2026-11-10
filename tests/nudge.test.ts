import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_WINDOW_MS, tabIsActive } from '../src/nudgeActivity.ts';

test('a visible tab stays active for ten minutes after the last input', () => {
  const now = 1_000_000;
  assert.equal(tabIsActive(true, now, now), true);
  assert.equal(tabIsActive(true, now - ACTIVE_WINDOW_MS, now), true);
  assert.equal(tabIsActive(true, now - ACTIVE_WINDOW_MS - 1, now), false);
  assert.equal(tabIsActive(false, now, now), false);
  assert.equal(tabIsActive(true, now + 1, now), false);
});
