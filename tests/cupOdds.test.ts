import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cupWinChance, playerSpread, type CupSideOutlook, type PricedStarter } from '../src/cupOdds.ts';
import { standardNormalCdf } from '../src/projections.ts';

function starter(partial: Partial<PricedStarter> & Pick<PricedStarter, 'projectedPoints' | 'weekPoints'>): PricedStarter {
  return { position: 'WR', previousPoints: [], ...partial };
}

function side(partial: Partial<CupSideOutlook> = {}): CupSideOutlook {
  return { legs: [null], finals: [false], week: 4, starters: [starter({ weekPoints: null, projectedPoints: 10 })], ...partial };
}

test('a player with fewer than two weeks keeps the position range', () => {
  assert.equal(playerSpread('QB', []), 7.5);
  assert.equal(playerSpread('QB', [22]), 7.5);
  assert.equal(playerSpread('K', []), 3.5);
  assert.equal(playerSpread('P', []), 7);
});

test('a wider weekly history stays wider after shrinking toward the position', () => {
  const steady = playerSpread('WR', [10, 10, 10, 10]);
  const wild = playerSpread('WR', [0, 30, 0, 30]);
  assert.ok(Math.abs(steady - Math.sqrt((4 * 64) / 7)) < 1e-9);
  assert.ok(wild > steady);
});

test('equal remaining projections are an even split', () => {
  assert.deepEqual(cupWinChance([4], side(), side()), { left: 50, right: 50 });
});

test('a yet-to-play starter with no projection stays unknown', () => {
  const missing = side({ starters: [starter({ weekPoints: null, projectedPoints: null })] });
  assert.equal(cupWinChance([4], side(), missing), null);
});

test('a played starter adds the actual score and no range', () => {
  const ahead = side({ starters: [starter({ weekPoints: 20, projectedPoints: 8 })] });
  const behind = side({ starters: [starter({ weekPoints: null, projectedPoints: 10, position: 'WR', previousPoints: [] })] });
  const chance = cupWinChance([4], ahead, behind);
  const expected = Math.round(standardNormalCdf(10 / 8) * 100);
  assert.deepEqual(chance, { left: expected, right: 100 - expected });
  assert.ok(expected > 80);
});

test('a more volatile starter makes the same lead less certain', () => {
  const ahead = side({ starters: [starter({ weekPoints: 20, projectedPoints: null })] });
  const steady = side({ starters: [starter({ weekPoints: null, projectedPoints: 10, previousPoints: [10, 10, 10, 10] })] });
  const wild = side({ starters: [starter({ weekPoints: null, projectedPoints: 10, previousPoints: [0, 30, 0, 30] })] });
  const calm = cupWinChance([4], ahead, steady);
  const shaky = cupWinChance([4], ahead, wild);
  assert.ok(calm && calm !== 'level' && shaky && shaky !== 'level');
  assert.ok(calm.left > shaky.left);
});

test('a finished leg is certain and a decided lineup is not a coin flip', () => {
  const ahead = side({ legs: [30, null], finals: [true, false], starters: [starter({ weekPoints: 5, projectedPoints: 12 })] });
  const behind = side({ legs: [10, null], finals: [true, false], starters: [starter({ weekPoints: 5, projectedPoints: 12 })] });
  assert.deepEqual(cupWinChance([3, 4], ahead, behind), { left: 100, right: 0 });
  assert.equal(cupWinChance([4], side({ starters: [starter({ weekPoints: 12, projectedPoints: 4 })] }), side({ starters: [starter({ weekPoints: 12, projectedPoints: 20 })] })), 'level');
});

test('a future week and a missing finished score stay unpriced', () => {
  const banked = side({ legs: [40, null], finals: [true, false], week: 3 });
  assert.equal(cupWinChance([3, 4], banked, banked), null);
  const blank = side({ legs: [null], finals: [true], starters: null });
  assert.equal(cupWinChance([3], blank, blank), null);
});

test('the two sides mirror each other', () => {
  const ahead = side({ starters: [starter({ weekPoints: null, projectedPoints: 18 })] });
  const behind = side({ starters: [starter({ weekPoints: null, projectedPoints: 10 })] });
  const left = cupWinChance([4], ahead, behind);
  const right = cupWinChance([4], behind, ahead);
  assert.ok(left && left !== 'level' && right && right !== 'level');
  assert.equal(left.left, right.right);
  assert.equal(left.right, right.left);
  assert.equal(left.left + left.right, 100);
});
