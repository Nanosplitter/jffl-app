import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historicalStarters } from '../src/lineups.ts';
import { benchPoints, kickoffWindow, matchdayMatches, matchNotes, matchTotal, playerBoard, pointSpan, pointsStillOut, priorLegOffset } from '../src/matchday.ts';
import type { LeagueSummary, RosteredPlayer } from '../src/types.ts';

const player = (partial: Partial<RosteredPlayer> & Pick<RosteredPlayer, 'id' | 'name'>): RosteredPlayer => ({
  teamId: '16', position: 'WR', proTeam: 'KC', slot: 'WR', group: 'starter', eligibleSlots: ['WR', 'BE'],
  injuryStatus: null, weekPoints: null, projectedPoints: 10, seasonPoints: null, averagePoints: null,
  weekStats: {}, seasonStats: {}, ...partial,
});

const now = Date.parse('2026-10-18T20:00:00Z');
const games = {
  KC: { kickoff: '2026-10-18T17:00:00Z', state: 'in' as const, detail: 'Q3 4:12', progress: 0.5, opponent: 'DET' },
  PHI: { kickoff: '2026-10-18T17:00:00Z', state: 'post' as const, detail: 'Final', progress: 1, opponent: 'NYG' },
};

test('kickoff windows follow the Eastern slate', () => {
  assert.equal(kickoffWindow('2026-10-16T00:15:00Z'), 'TNF');
  assert.equal(kickoffWindow('2026-10-18T17:00:00Z'), 'SUN 1PM');
  assert.equal(kickoffWindow('2026-10-18T20:25:00Z'), 'SUN 4PM');
  assert.equal(kickoffWindow('2026-10-19T00:20:00Z'), 'SNF');
  assert.equal(kickoffWindow('2026-10-20T00:15:00Z'), 'MNF');
  assert.equal(kickoffWindow(null), null);
});

test('a cup offset adds finished legs and a missing week score stays blank', () => {
  assert.equal(priorLegOffset([6, 7], [100, null], 7), 100);
  assert.equal(priorLegOffset([6, 7], [100, null], 6), 0);
  assert.equal(priorLegOffset([6, 7], [100, null], 7, [false, false]), 0);
  assert.equal(matchTotal(null, 0), null);
  assert.equal(matchTotal(null, 100), 100);
  assert.equal(matchTotal(10, 5), 15);
});

test('the player board splits pace, byes, and players still to come', () => {
  const board = playerBoard([
    player({ id: '1', name: 'Hot', weekPoints: 12, kickoff: '2026-10-18T17:00:00Z' }),
    player({ id: '2', name: 'Cold', weekPoints: 2, kickoff: '2026-10-18T17:00:00Z' }),
    player({ id: '3', name: 'Close', weekPoints: 5.4, kickoff: '2026-10-18T17:00:00Z' }),
    player({ id: '4', name: 'Waiting', proTeam: 'BUF', kickoff: '2026-10-20T00:15:00Z' }),
    player({ id: '5', name: 'Resting', proTeam: 'MIN', projectedPoints: 9 }),
    player({ id: '6', name: 'Done', proTeam: 'PHI', weekPoints: 14, kickoff: '2026-10-18T17:00:00Z' }),
    player({ id: '7', name: 'Silent', weekPoints: null, projectedPoints: 8, kickoff: '2026-10-18T17:00:00Z' }),
  ], games, now, 6);
  assert.deepEqual(board.playing.map(row => row.player.name), ['Hot', 'Cold', 'Close', 'Silent']);
  assert.equal(board.playing.find(row => row.player.name === 'Hot')?.detail, 'Q3 4:12 · vs DET');
  assert.equal(board.playing.find(row => row.player.name === 'Silent')?.gap, null);
  assert.deepEqual(board.above.map(row => row.player.name), ['Hot', 'Done']);
  assert.deepEqual(board.below.map(row => row.player.name), ['Cold']);
  assert.deepEqual(board.yet.map(group => [group.window, group.players.map(row => row.player.name)]), [['MNF', ['Waiting']]]);
  assert.deepEqual(board.bye.map(row => row.player.name), ['Resting']);
  assert.deepEqual(board.done.map(row => row.player.name), ['Done']);
  assert.equal(board.above[0].gap, 7);
});

function league(matchup: LeagueSummary['matchups'][number]): LeagueSummary {
  return {
    schemaVersion: 1, leagueId: '831337', slug: 'premier', leagueName: 'Premier League', season: 2026, week: 6,
    updatedAt: '2026-10-18T20:00:00Z', lastAttemptAt: '2026-10-18T20:00:00Z', refreshStatus: 'ok',
    teams: [], scoring: [], matchups: [matchup],
    weeklyMatchups: [{ ...matchup, week: 6, status: 'live' }],
  };
}

test('a past matchday uses that week’s saved score and lineup, not the live roster', () => {
  const current = league({ id: '7-0', homeTeamId: '16', awayTeamId: '34', homeScore: 4, awayScore: 0, homeProjected: 110, awayProjected: 105 });
  current.week = 7;
  current.weeklyMatchups = [
    { id: '6-0', week: 6, status: 'final', homeTeamId: '16', awayTeamId: '34', homeScore: 121.4, awayScore: 98.2, homeProjected: 108, awayProjected: 101 },
    { ...current.matchups[0], week: 7, status: 'live' },
  ];
  const match = matchdayMatches({ premier: current }, 'premier', '16', 6).find(item => item.kind === 'league');
  assert.equal(match?.week, 6);
  assert.equal(match?.status, 'final');
  assert.equal(match?.left.score, 121.4);
  assert.equal(match?.right?.score, 98.2);
  const starters = historicalStarters([
    { week: 6, teamId: '16', players: [{ id: '1', name: 'Week Six Starter', position: 'WR', proTeam: 'KC', slot: 'WR', points: 18.5 }] },
    { week: 7, teamId: '16', players: [{ id: '2', name: 'Current Starter', position: 'RB', proTeam: 'DET', slot: 'RB', points: 4 }] },
  ], '16', 6);
  assert.deepEqual(starters?.map(player => player.name), ['Week Six Starter']);
  assert.equal(starters?.[0].weekPoints, 18.5);
});

test('matchday lists the league game with the chosen manager on the left', () => {
  const matches = matchdayMatches({ premier: league({ id: '6-0', homeTeamId: '16', awayTeamId: '34', homeScore: 80, awayScore: 70, homeProjected: 110, awayProjected: 105 }) }, 'premier', '16');
  const match = matches.find(item => item.kind === 'league');
  assert.equal(match?.left.manager, 'Jason');
  assert.equal(match?.left.score, 80);
  assert.equal(match?.right?.manager, 'Donna');
  assert.equal(match?.right?.score, 70);
  assert.equal(match?.href, '/league/premier/match/6-0');
  const bye = matchdayMatches({ premier: league({ id: '6-1', homeTeamId: '34', awayTeamId: null, homeScore: null, awayScore: null, homeProjected: null, awayProjected: null }) }, 'premier', '34');
  assert.equal(bye.find(item => item.kind === 'league')?.right, null);
});

test('notes cover the projection gap, the swing left, the bench, and a lineup that would have won', () => {
  const notes = matchNotes({
    leftName: 'Jason', rightName: 'Donna', leftProjected: 100, rightProjected: 108,
    leftTeamId: '16', rightTeamId: '34', games: {}, now, week: 6, final: false,
    leftScore: 10, rightScore: 12, leftTotal: 10, rightTotal: 12,
    leftPlayers: [
      player({ id: 'sit', name: 'Sat', slot: 'WR', group: 'starter', weekPoints: 4, projectedPoints: 10, position: 'QB', proTeam: 'BUF', kickoff: '2026-10-20T00:15:00Z' }),
      player({ id: 'in', name: 'Started', slot: 'BE', group: 'bench', weekPoints: 14, projectedPoints: null, eligibleSlots: ['WR', 'BE'] }),
      player({ id: 'bench', name: 'Spare', slot: 'BE', group: 'bench', weekPoints: 3.5, position: 'RB' }),
    ],
    rightPlayers: [player({ id: 'opp', name: 'Opponent', teamId: '34', slot: 'WR', group: 'starter', weekPoints: 12, proTeam: 'PHI', kickoff: '2026-10-18T13:00:00Z' })],
  });
  assert.equal(notes[0], 'Jason needs 8 more than projected.');
  assert.equal(notes[1], 'Biggest swing left: Sat (±7.5).');
  assert.equal(notes[2], 'Bench: Jason 17.5, Donna —.');
  const lost = matchNotes({
    leftName: 'Jason', rightName: 'Donna', leftProjected: null, rightProjected: null,
    leftTeamId: '16', rightTeamId: '34', games, now, week: 6, final: true,
    leftScore: 10, rightScore: 12, leftTotal: 10, rightTotal: 12,
    leftPlayers: [
      player({ id: 'sit', name: 'Sat', slot: 'WR', group: 'starter', weekPoints: 4, eligibleSlots: ['WR'] }),
      player({ id: 'stay', name: 'Stayed', slot: 'RB', group: 'starter', weekPoints: 6, position: 'RB', eligibleSlots: ['RB'] }),
      player({ id: 'in', name: 'Started', slot: 'BE', group: 'bench', weekPoints: 14, eligibleSlots: ['WR'] }),
    ],
    rightPlayers: [player({ id: 'opp', name: 'Opponent', teamId: '34', weekPoints: 12, eligibleSlots: ['WR'] })],
  });
  assert.deepEqual(lost, [
    'Biggest swing left: Sat (±8).',
    'Bench: Jason 14, Donna —.',
    'Starting Started instead of Sat would have won.',
  ]);
});

test('a player range is a low and a high score, and points left use the same span', () => {
  const board = playerBoard([
    player({ id: '1', name: 'Live', weekPoints: 4, projectedPoints: 10, kickoff: '2026-10-18T17:00:00Z' }),
    player({ id: '2', name: 'Later', proTeam: 'BUF', projectedPoints: 12, kickoff: '2026-10-20T00:15:00Z' }),
  ], games, now, 6);
  const live = pointSpan(board.playing[0]);
  assert.equal(live?.center, 9);
  assert.ok(live && live.low < 9 && live.high > 9);
  const waiting = pointSpan(board.yet[0].players[0]);
  assert.equal(waiting?.low, 12 - board.yet[0].players[0].spread);
  assert.equal(waiting?.high, 12 + board.yet[0].players[0].spread);
  const left = pointsStillOut(board);
  assert.equal(left.count, 2);
  assert.ok(left.low != null && left.high != null && left.low < left.high);
});

test('bench points ignore a player who has not scored', () => {
  assert.equal(benchPoints([player({ id: '1', name: 'A', group: 'bench', slot: 'BE', weekPoints: null }), player({ id: '2', name: 'B', group: 'bench', slot: 'BE', weekPoints: 0 })], '16'), 0);
  assert.equal(benchPoints([player({ id: '1', name: 'A', group: 'bench', slot: 'BE', weekPoints: null })], '16'), null);
});
