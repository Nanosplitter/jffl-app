import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectedWinChance } from '../src/projections.ts';

test('a missing projection stays absent, including a real zero on the other side', () => {
  assert.equal(projectedWinChance(null, 100), null);
  assert.equal(projectedWinChance(100, null), null);
  assert.equal(projectedWinChance(null, null), null);
  assert.deepEqual(projectedWinChance(0, 0), { home: 50, away: 50 });
});

test('equal ESPN projections are an even split and a 15-point lead is about 84 percent', () => {
  assert.deepEqual(projectedWinChance(108.4, 108.4), { home: 50, away: 50 });
  const lead = projectedWinChance(115, 100);
  assert.deepEqual(lead, { home: 84, away: 16 });
  assert.equal(lead && lead.home + lead.away, 100);
});

test('the two sides mirror each other and a large gap approaches a certainty', () => {
  const homeLead = projectedWinChance(130, 100);
  const awayLead = projectedWinChance(100, 130);
  assert.equal(homeLead?.home, awayLead?.away);
  assert.equal(homeLead?.away, awayLead?.home);
  assert.deepEqual(projectedWinChance(200, 100), { home: 100, away: 0 });
});
