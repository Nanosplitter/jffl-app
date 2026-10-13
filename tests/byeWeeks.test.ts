import assert from 'node:assert/strict';
import { test } from 'node:test';
import { byeWeek } from '../src/byeWeeks.ts';

const CLUBS = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH'];

test('each NFL club has one 2026 bye week', () => {
  const weeks = CLUBS.map(club => byeWeek(club));
  assert.equal(weeks.length, 32);
  assert.equal(weeks.every(week => week != null), true);
  assert.deepEqual([...new Set(weeks)].sort((a, b) => a! - b!), [5, 6, 7, 8, 9, 10, 11, 13, 14]);
  assert.equal(CLUBS.filter(club => byeWeek(club) === 11).length, 6);
  assert.equal(byeWeek('ne'), 11);
  assert.equal(byeWeek('DAL'), 14);
  assert.equal(byeWeek('None'), null);
  assert.equal(byeWeek(null), null);
});
