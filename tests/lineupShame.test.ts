import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shameLabel, shameWall } from '../src/lineupShame.ts';
import type { LeagueSlug, WeekLineup } from '../src/types.ts';

const sunday = Date.parse('2026-10-18T17:00:00Z');
const monday = Date.parse('2026-10-20T00:15:00Z');
const games = { BUF: { kickoff: '2026-10-18T17:00:00Z' }, KC: { kickoff: '2026-10-20T00:15:00Z' }, CAR: { kickoff: null } };

function lineup(week: number, teamId: string, players: WeekLineup['players']): WeekLineup {
  return { week, teamId, players };
}

function player(id: string, name: string, slot: string, proTeam: string, extra: Partial<WeekLineup['players'][number]> = {}): WeekLineup['players'][number] {
  return { id, name, position: slot, proTeam, slot, points: null, ...extra };
}

function wall(rosters: Partial<Record<LeagueSlug, { weeklyLineups: WeekLineup[] }>>, week: number, currentWeek: number, now: number, scoreboard: typeof games | null = games) {
  return shameWall(rosters, week, currentWeek, scoreboard, now);
}

test('a current week hides a bye until the last kickoff and keeps a saved out or ir lock', () => {
  const rosters = {
    premier: { weeklyLineups: [lineup(5, '16', [
      player('1', 'Healthy', 'QB', 'BUF'),
      player('2', 'Absent', 'WR', 'BUF', { locked: { reason: 'out', at: '2026-10-18T17:00:00Z' }, points: 0 }),
      player('3', 'Shelved', 'RB', 'BUF', { locked: { reason: 'ir', at: '2026-10-18T17:00:00Z' } }),
      player('4', 'Idle', 'TE', 'CAR'),
      player('5', 'Reserve', 'IR', 'BUF', { locked: { reason: 'out', at: '2026-10-18T17:00:00Z' } }),
    ])] },
  };
  const early = wall(rosters, 5, 5, monday - 1);
  assert.deepEqual(early[0].entries.map(entry => [entry.name, shameLabel(entry.reason)]), [
    ['Shelved', 'IR at kickoff'],
    ['Absent', 'OUT at kickoff'],
  ]);
  const late = wall(rosters, 5, 5, monday);
  assert.deepEqual(late[0].entries.map(entry => entry.name), ['Shelved', 'Absent', 'Idle']);
  assert.equal(shameLabel(late[0].entries[2].reason), 'BYE');
  assert.deepEqual(wall(rosters, 5, 5, monday, {}).map(group => group.entries.map(entry => entry.name)), [['Shelved', 'Absent']]);
  assert.deepEqual(wall(rosters, 5, 5, monday, null)[0].entries.map(entry => entry.name), ['Shelved', 'Absent']);
});

test('a past week keeps the bye and a future week does not accuse anyone', () => {
  const rosters = {
    premier: { weeklyLineups: [lineup(5, '34', [player('4', 'Idle', 'TE', 'CAR', { points: 0 })])] },
  };
  assert.equal(wall(rosters, 5, 8, sunday - 1, null)[0].entries[0].reason, 'bye');
  assert.deepEqual(wall(rosters, 5, 4, monday), []);
});

test('locks without a trustworthy record are left out, and a lock beats a bye', () => {
  const rosters = {
    premier: { weeklyLineups: [lineup(5, '16', [
      player('4', 'Idle', 'WR', 'BUF', { locked: { reason: 'out', at: 'not-a-time' } }),
      player('6', 'Tagged', 'RB', 'CAR', { locked: { reason: 'ir', at: '2026-10-18T17:00:00Z' } }),
      player('6', 'Tagged', 'RB', 'CAR'),
      player('7', 'Maybe', 'QB', 'BUF', { locked: { reason: 'questionable', at: '2026-10-18T17:00:00Z' } as WeekLineup['players'][number]['locked'] }),
    ])] },
  };
  const rows = wall(rosters, 5, 8, monday, null);
  assert.deepEqual(rows[0].entries.map(entry => [entry.name, entry.reason]), [['Tagged', 'ir']]);
});

test('managers stay in league order and starters stay in lineup order', () => {
  const rosters = {
    'league-one': { weeklyLineups: [lineup(5, '29', [player('9', 'One', 'QB', 'BUF', { locked: { reason: 'out', at: '2026-10-18T17:00:00Z' } })])] },
    championship: { weeklyLineups: [lineup(5, '1', [player('8', 'Two', 'QB', 'BUF', { locked: { reason: 'out', at: '2026-10-18T17:00:00Z' } })])] },
    premier: { weeklyLineups: [lineup(5, '16', [
      player('3', 'Zed', 'RB', 'BUF', { locked: { reason: 'out', at: '2026-10-18T17:00:00Z' } }),
      player('2', 'Amy', 'QB', 'BUF', { locked: { reason: 'out', at: '2026-10-18T17:00:00Z' } }),
    ]), lineup(5, '34', [player('1', 'Bea', 'QB', 'BUF', { locked: { reason: 'out', at: '2026-10-18T17:00:00Z' } })])] },
  };
  const groups = wall(rosters, 5, 5, sunday, games);
  assert.deepEqual(groups.map(group => [group.manager, group.entries.map(entry => entry.name)]), [
    ['Donna', ['Bea']],
    ['Jason', ['Amy', 'Zed']],
    ['Jasmin', ['Two']],
    ['RonniColin', ['One']],
  ]);
});
