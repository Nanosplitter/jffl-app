import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MANAGERS } from '../src/reference.ts';
import { playedArchive } from '../src/history/played.ts';
import { savedSeason, type SavedHistory } from '../src/history/savedSeason.ts';
import { WEEKLY, parseArchive, recordBook, type ArchiveFile } from '../src/history/stats.ts';
import type { LiveSeason } from '../src/history/liveSeason.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);
const names = JSON.parse(readFileSync(new URL('../functions/manager_names.json', import.meta.url), 'utf8')) as Record<string, Record<string, { manager: string; jfflSeed: number; leagueSeed: number }>>;

test('the updater nickname map matches the site roster', () => {
  assert.equal(MANAGERS.length, 30);
  for (const person of MANAGERS) {
    const saved = names[person.slug]?.[person.teamId];
    assert.equal(saved?.manager, person.manager);
    assert.equal(saved?.jfflSeed, person.jfflSeed);
    assert.equal(saved?.leagueSeed, person.leagueSeed);
  }
});

test('a finished current-season score joins the weekly record book and a live game does not', () => {
  const live = {
    games: [
      { season: 2026, league: 'League One', type: 'Season', round: '5', week: 5, teamA: 'RonniColin', teamB: 'Joe', scoreA: 158, scoreB: 90, status: 'final' },
      { season: 2026, league: 'League One', type: 'Season', round: '6', week: 6, teamA: 'RonniColin', teamB: 'Joe', scoreA: 10, scoreB: 12, status: 'live' },
    ],
    seasons: [],
  } as unknown as LiveSeason;
  const played = playedArchive({ ...archive, live });
  const highest = recordBook(played.games, WEEKLY).highest;
  const ronni = highest.find(row => row.team === 'RonniColin' && row.season === 2026 && row.score === 158);
  assert.ok(ronni);
  assert.ok(highest.findIndex(row => row.team === 'RonniColin' && row.score === 158) < 12);
  assert.equal(played.games.some(game => game.season === 2026 && game.week === 6), false);
});

test('a saved season keeps its nicknames after that year is no longer the live snapshot', () => {
  const doc: SavedHistory = {
    schemaVersion: 1,
    season: 2026,
    leagues: {
      'league-one': {
        week: 5,
        completedWeeks: 5,
        updatedAt: 'saved',
        teams: [
          { id: '999', name: 'Club A', manager: 'RonniColin', jfflSeed: 30, leagueSeed: 10, wins: 1, losses: 0, ties: 0, pointsFor: 158 },
          { id: '998', name: 'Club B', manager: 'Joe', jfflSeed: 26, leagueSeed: 7, wins: 0, losses: 1, ties: 0, pointsFor: 90 },
        ],
        weeklyMatchups: [
          { id: '5-1', week: 5, status: 'final', homeTeamId: '999', awayTeamId: '998', homeScore: 158, awayScore: 90 },
        ],
      },
    },
  };
  const saved = savedSeason(doc);
  assert.ok(saved);
  const played = playedArchive({ ...archive, live: null, saved: [saved.live] });
  const row = recordBook(played.games, WEEKLY).highest.find(item => item.season === 2026 && item.team === 'RonniColin');
  assert.equal(row?.score, 158);
  assert.equal(row?.opponent, 'Joe');
  const later = {
    games: [{ season: 2026, league: 'League One', type: 'Season', round: '5', week: 5, teamA: 'RonniColin', teamB: 'Joe', scoreA: 160, scoreB: 90, status: 'final' }],
    seasons: [],
  } as unknown as LiveSeason;
  const replaced = playedArchive({ ...archive, live: later, saved: [saved.live] });
  assert.equal(recordBook(replaced.games, WEEKLY).highest.find(item => item.season === 2026 && item.team === 'RonniColin')?.score, 160);
});
