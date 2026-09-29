import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historicalStarters } from '../src/lineups.ts';

const lineups = [{
  week: 2,
  teamId: '7',
  players: [
    { id: '3', name: 'Kicker', position: 'K', proTeam: 'ATL', slot: 'K', points: 0 },
    { id: '-16016', name: 'Vikings D/ST', position: 'D/ST', proTeam: 'MIN', slot: 'D/ST', points: null },
    { id: '1', name: 'Quarterback', position: 'QB', proTeam: 'BUF', slot: 'QB', points: 21.5 },
  ],
}];

test('a finished week keeps a real zero and a missing score, in lineup order', () => {
  const starters = historicalStarters(lineups, '7', 2);
  assert.deepEqual(starters?.map(player => [player.slot, player.weekPoints, player.id]), [
    ['QB', 21.5, '1'],
    ['D/ST', null, '-16016'],
    ['K', 0, '3'],
  ]);
});

test('a week the snapshot has not published yet stays unknown', () => {
  assert.equal(historicalStarters(lineups, '7', 5), null);
  assert.deepEqual(historicalStarters(lineups, '8', 2), []);
  assert.equal(historicalStarters(undefined, '7', 2), null);
});
