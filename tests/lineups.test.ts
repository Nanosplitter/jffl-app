import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canStillSwing, closestListed, closestOpen, compareByLineup, historicalStarters, pointsStillToPlay, slotLabel } from '../src/lineups.ts';
import type { RosteredPlayer } from '../src/types.ts';

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

test('a roster follows ESPN order and the flex slot reads FLEX', () => {
  const players = [
    { slot: 'K', position: 'K', name: 'Kicker' },
    { slot: 'D/ST', position: 'D/ST', name: 'Defense' },
    { slot: 'RB/WR/TE', position: 'RB', name: 'Flex' },
    { slot: 'WR', position: 'WR', name: 'Zeta' },
    { slot: 'WR', position: 'WR', name: 'Alpha' },
    { slot: 'TE', position: 'TE', name: 'Tight end' },
    { slot: 'RB', position: 'RB', name: 'Back' },
    { slot: 'QB', position: 'QB', name: 'Quarterback' },
    { slot: 'BE', position: 'K', name: 'Bench kicker' },
    { slot: 'BE', position: 'QB', name: 'Bench quarterback' },
  ];
  assert.deepEqual(players.filter(player => player.slot !== 'BE').sort(compareByLineup).map(player => player.name), [
    'Quarterback', 'Back', 'Alpha', 'Zeta', 'Tight end', 'Flex', 'Defense', 'Kicker',
  ]);
  assert.deepEqual(players.filter(player => player.slot === 'BE').sort(compareByLineup).map(player => player.name), [
    'Bench quarterback', 'Bench kicker',
  ]);
  assert.equal(slotLabel('RB/WR/TE'), 'FLEX');
  assert.equal(slotLabel('FLEX'), 'FLEX');
  assert.equal(slotLabel('BE'), 'Bench');
});

test('a week the snapshot has not published yet stays unknown', () => {
  assert.equal(historicalStarters(lineups, '7', 5), null);
  assert.deepEqual(historicalStarters(lineups, '8', 2), []);
  assert.equal(historicalStarters(undefined, '7', 2), null);
});

const played = (teamId: string, points: number): RosteredPlayer => ({
  id: `${teamId}-played`, teamId, name: 'Played', position: 'WR', proTeam: 'BUF', slot: 'WR', group: 'starter',
  eligibleSlots: [], injuryStatus: null, weekPoints: points, projectedPoints: points, seasonPoints: null, averagePoints: null, weekStats: {}, seasonStats: {},
});
const waiting = (teamId: string, projected: number): RosteredPlayer => ({
  id: `${teamId}-waiting`, teamId, name: 'Waiting', position: 'QB', proTeam: 'KC', slot: 'QB', group: 'starter',
  eligibleSlots: [], injuryStatus: null, weekPoints: null, projectedPoints: projected, seasonPoints: null, averagePoints: null, weekStats: {}, seasonStats: {},
});

test('the closest game that can still flip beats a tighter game whose lineups are done', () => {
  const players = [played('home', 10), played('away', 12), waiting('trail', 9), played('lead', 20)];
  assert.equal(pointsStillToPlay(players, 'away'), 0);
  assert.equal(pointsStillToPlay(players, 'trail'), 9);
  assert.equal(pointsStillToPlay(players, 'missing'), null);
  assert.equal(canStillSwing(80, 82, 0, 0), false);
  assert.equal(canStillSwing(70, 76, 9, 0), true);
  assert.equal(canStillSwing(70, 76, 6, 0), false);
  assert.equal(canStillSwing(80, 80, 4, 0), true);
  const picked = closestOpen([
    { id: 'locked', margin: 2, open: canStillSwing(80, 82, 0, 0) },
    { id: 'open', margin: 6, open: canStillSwing(70, 76, 9, 0) },
    { id: 'tie', margin: 0, open: canStillSwing(80, 80, 4, 0) },
  ]);
  assert.equal(picked?.id, 'tie');
  const finished = closestOpen([
    { id: 'locked', margin: 2, open: false },
    { id: 'wider', margin: 9, open: false },
  ]);
  assert.equal(finished?.id, 'locked');
});

test('closest list keeps every tie, then fills to three with the next closest', () => {
  const rows = [
    { id: 'tight-open', margin: 2, open: true },
    { id: 'tight-locked', margin: 2, open: false },
    { id: 'next', margin: 5, open: false },
    { id: 'wider', margin: 9, open: true },
    { id: 'closer-but-done', margin: 1, open: false },
  ];
  assert.deepEqual(closestListed(rows).map(row => row.id), ['tight-open', 'tight-locked', 'next']);
  const fourTied = [0, 1, 2, 3].map(id => ({ id, margin: 4, open: id === 0 }));
  assert.deepEqual(closestListed([...fourTied, { id: 'wider', margin: 8, open: true }]).map(row => row.id), [0, 1, 2, 3]);
  assert.deepEqual(closestListed([{ id: 'only', margin: 3, open: true }]).map(row => row.id), ['only']);
});
