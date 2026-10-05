import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canStillSwing, closestListed, closestOpen, compareByLineup, historicalStarters, lineupWouldWin, pointsStillToPlay, slotLabel, type LineupCandidate } from '../src/lineups.ts';
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

const spot = (id: string, slot: string, group: LineupCandidate['group'], weekPoints: number | null, eligibleSlots: string[], name = id): LineupCandidate => ({
  id, name, slot, group, eligibleSlots, weekPoints,
});

test('one eligible start/sit is enough when it passes the opponent', () => {
  const team = [
    spot('sit', 'WR', 'starter', 4, ['WR'], 'Sat'),
    spot('stay', 'RB', 'starter', 6, ['RB'], 'Stayed'),
    spot('in', 'WR', 'bench', 14, ['WR'], 'Started'),
    spot('qb', 'QB', 'bench', 30, ['QB'], 'Quarterback'),
  ];
  const opponent = [spot('opp', 'WR', 'starter', 12, ['WR'], 'Opponent')];
  const swing = lineupWouldWin(team, opponent, 10, 12);
  const started = { id: 'in', name: 'Started', points: 14, position: '', proTeam: '' };
  const sat = { id: 'sit', name: 'Sat', points: 4, position: '', proTeam: '' };
  assert.deepEqual(swing, { score: 20, start: [started], sit: [sat], swaps: [{ start: started, sit: sat }] });
});

test('a lineup that only ties, or a player in the wrong slot, does not count as a win', () => {
  const tied = lineupWouldWin(
    [spot('out', 'WR', 'starter', 10, ['WR']), spot('in', 'WR', 'bench', 20, ['WR'])],
    [spot('opp', 'WR', 'starter', 100, ['WR'])],
    90,
    100,
  );
  const won = lineupWouldWin(
    [spot('out', 'WR', 'starter', 10, ['WR']), spot('in', 'WR', 'bench', 21, ['WR'])],
    [spot('opp', 'WR', 'starter', 100, ['WR'])],
    90,
    100,
  );
  const wrongSlot = lineupWouldWin(
    [spot('out', 'WR', 'starter', 4, ['WR']), spot('qb', 'QB', 'bench', 30, ['QB'])],
    [spot('opp', 'WR', 'starter', 12, ['WR'])],
    10,
    12,
  );
  assert.equal(tied, null);
  assert.equal(won?.score, 101);
  assert.equal(wrongSlot, null);
});

test('a missing starter score stays undecided and a missing bench score is not zero', () => {
  const opponent = [spot('opp', 'WR', 'starter', 20, ['WR'])];
  assert.equal(lineupWouldWin(
    [spot('out', 'WR', 'starter', null, ['WR']), spot('in', 'WR', 'bench', 40, ['WR'])],
    opponent,
    10,
    20,
  ), null);
  assert.equal(lineupWouldWin(
    [spot('out', 'WR', 'starter', 4, ['WR']), spot('in', 'WR', 'bench', 40, ['WR'])],
    [spot('opp', 'WR', 'starter', null, ['WR'])],
    10,
    20,
  ), null);
  assert.equal(lineupWouldWin(
    [spot('out', 'WR', 'starter', 4, ['WR']), spot('in', 'WR', 'bench', null, ['WR'])],
    opponent,
    10,
    20,
  ), null);
  assert.equal(lineupWouldWin(
    [spot('out', 'WR', 'starter', 4, ['WR']), spot('ir', 'WR', 'ir', 40, ['WR'])],
    opponent,
    10,
    20,
  ), null);
});

test('the fewest moves win, and a flex only takes a player eligible for it', () => {
  const twoMoves = lineupWouldWin(
    [
      spot('a', 'WR', 'starter', 1, ['WR'], 'Alpha'),
      spot('b', 'WR', 'starter', 1, ['WR'], 'Bravo'),
      spot('c', 'WR', 'bench', 10, ['WR'], 'Charlie'),
      spot('d', 'WR', 'bench', 10, ['WR'], 'Delta'),
    ],
    [spot('opp', 'WR', 'starter', 30, ['WR'])],
    20,
    30,
  );
  assert.deepEqual(twoMoves?.start.map(player => player.name), ['Charlie', 'Delta']);
  assert.equal(twoMoves?.score, 38);

  const oneMove = lineupWouldWin(
    [
      spot('low', 'WR', 'starter', 0, ['WR'], 'Low'),
      spot('fine', 'WR', 'starter', 10, ['WR'], 'Fine'),
      spot('enough', 'WR', 'bench', 12, ['WR'], 'Enough'),
      spot('extra', 'WR', 'bench', 18, ['WR'], 'Extra'),
    ],
    [spot('opp', 'WR', 'starter', 20, ['WR'])],
    10,
    20,
  );
  assert.deepEqual(oneMove?.start.map(player => player.id), ['extra']);
  assert.deepEqual(oneMove?.sit.map(player => player.id), ['low']);
  assert.equal(oneMove?.score, 28);

  const flex = lineupWouldWin(
    [spot('flex', 'RB/WR/TE', 'starter', 2, ['RB/WR/TE'], 'Flex'), spot('back', 'RB', 'bench', 12, ['RB', 'RB/WR/TE'], 'Back')],
    [spot('opp', 'RB', 'starter', 25, ['RB'])],
    20,
    25,
  );
  assert.equal(flex?.score, 30);
  assert.equal(lineupWouldWin(
    [spot('flex', 'RB/WR/TE', 'starter', 2, ['RB/WR/TE'], 'Flex'), spot('qb', 'QB', 'bench', 40, ['QB'], 'Quarterback')],
    [spot('opp', 'RB', 'starter', 25, ['RB'])],
    20,
    25,
  ), null);
});

test('a team that already won stays off the list, including a tie that a bench score would have taken', () => {
  const ahead = lineupWouldWin(
    [spot('out', 'WR', 'starter', 10, ['WR']), spot('in', 'WR', 'bench', 30, ['WR'])],
    [spot('opp', 'WR', 'starter', 90, ['WR'])],
    100,
    90,
  );
  const level = lineupWouldWin(
    [spot('out', 'WR', 'starter', 10, ['WR']), spot('in', 'WR', 'bench', 15, ['WR'])],
    [spot('opp', 'WR', 'starter', 100, ['WR'])],
    100,
    100,
  );
  assert.equal(ahead, null);
  assert.equal(level?.score, 105);
  const adjusted = lineupWouldWin(
    [spot('out', 'WR', 'starter', 10, ['WR'], 'Starter'), spot('in', 'WR', 'bench', 20, ['WR'], 'Bench')],
    [spot('opp', 'WR', 'starter', 16, ['WR'])],
    12,
    16,
  );
  assert.equal(adjusted?.score, 22);
});

test('two swaps stay paired with the slot they filled, and a third move stays off the list', () => {
  const paired = lineupWouldWin(
    [
      spot('low', 'WR', 'starter', 0, ['WR'], 'Low'),
      spot('big', 'RB', 'starter', 6, ['RB'], 'Big'),
      spot('high', 'WR', 'bench', 10, ['WR'], 'High'),
      spot('mid', 'RB', 'bench', 9, ['RB'], 'Mid'),
    ],
    [spot('opp', 'WR', 'starter', 18, ['WR'])],
    6,
    18,
  );
  assert.deepEqual(paired?.swaps.map(swap => [swap.start.id, swap.sit.id]), [['high', 'low'], ['mid', 'big']]);

  const three = lineupWouldWin(
    [
      spot('a', 'WR', 'starter', 0, ['WR']),
      spot('b', 'RB', 'starter', 0, ['RB']),
      spot('c', 'TE', 'starter', 0, ['TE']),
      spot('d', 'WR', 'bench', 5, ['WR']),
      spot('e', 'RB', 'bench', 5, ['RB']),
      spot('f', 'TE', 'bench', 5, ['TE']),
    ],
    [spot('opp', 'WR', 'starter', 12, ['WR'])],
    0,
    12,
  );
  assert.equal(three, null);
});
