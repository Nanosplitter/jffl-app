import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SummaryMap } from '../src/competitions.ts';
import { buildLiveSeason, finishedGames, type RosterMap } from '../src/history/liveSeason.ts';

const read = <T>(name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
const summaries = read<SummaryMap>('week3-summaries.json');
const rosters = read<RosterMap>('week3-rosters.json');
const live = buildLiveSeason(summaries, rosters)!;

test('nothing is built before a league snapshot loads', () => {
  assert.equal(buildLiveSeason({}, {}), null);
});

test('snapshot info uses the oldest league update and the current week', () => {
  assert.equal(live.season, 2026);
  assert.equal(live.week, 3);
  assert.equal(live.asOf, '2026-09-29T01:04:33.384911+00:00');
  assert.equal(live.rostersLoaded, false);
});

test('regular-season games map ESPN teams to manager nicknames and keep live separate from final', () => {
  const regular = live.games.filter(game => game.type === 'Season');
  assert.equal(regular.length, 45);
  const donnaJason = regular.find(game => game.week === 3 && game.league === 'Premier' && game.teamA === 'Donna');
  assert.deepEqual(donnaJason && { b: donnaJason.teamB, a: donnaJason.scoreA, bScore: donnaJason.scoreB, status: donnaJason.status }, { b: 'Jason', a: 112, bScore: 79, status: 'live' });
  assert.ok(regular.filter(game => game.week <= 2).every(game => game.status === 'final'));
  assert.ok(regular.filter(game => game.week === 3).every(game => game.status === 'live'));
  assert.ok(regular.every(game => game.round === String(game.week)));
});

test('unknown scores stay null and pending weeks are left out', () => {
  const copy = structuredClone(summaries);
  const week3 = copy.premier!.weeklyMatchups!.find(item => item.week === 3)!;
  week3.homeScore = null;
  copy.premier!.weeklyMatchups!.push({ ...week3, id: '4-1', week: 4, status: 'pending', homeScore: null, awayScore: null });
  const built = buildLiveSeason(copy)!;
  const game = built.games.find(item => item.type === 'Season' && item.week === 3 && item.league === 'Premier' && item.scoreA === null);
  assert.ok(game);
  assert.notEqual(game.scoreB, null);
  assert.equal(built.games.some(item => item.week === 4), false);
});

test('only finished games with both scores count as results', () => {
  const done = finishedGames(live);
  assert.ok(done.length > 0);
  assert.ok(done.every(game => typeof game.scoreA === 'number' && typeof game.scoreB === 'number' && !('status' in game)));
  assert.equal(done.some(game => game.season === 2026 && game.week === 3), false);
  assert.deepEqual(finishedGames(null), []);
});

test('cup rows come from the cup brackets with archive round labels', () => {
  const cups = live.games.filter(game => game.type === 'Cup');
  assert.ok(cups.length > 0);
  const leagueCup = cups.filter(game => game.league === 'Premier');
  assert.ok(leagueCup.length > 0 && leagueCup.every(game => game.round === '1' && game.status === 'final' && game.week === null));
  assert.ok(cups.every(game => /^\d+(-Final)?$/.test(game.round)));
  const jffl = cups.filter(game => game.league === 'JFFL');
  assert.equal(jffl.length, 14);
  assert.ok(jffl.every(game => game.round === '1' && game.status === 'live'));
});

test('season rows hold current positions and keep undecided titles unknown', () => {
  assert.equal(live.seasons.length, 30);
  const jason = live.seasons.find(row => row.team === 'Jason')!;
  assert.equal(jason.league, 'Premier');
  assert.equal(jason.standing, 1);
  assert.equal(jason.rankSeason, null);
  assert.equal(jason.rankFinal, null);
  assert.equal(jason.jfflRank, null);
  assert.equal(jason.cupRank, null);
  assert.equal(jason.draft, null);
  assert.equal(jason.wins, 2);
  assert.equal(jason.points, 231);
  assert.equal(jason.pointsPerWeek, 115.5);
});

test('player weeks flag starters, bench, and unknown slots, and keep unknown points null', () => {
  const rows = live.players;
  assert.equal(rows.length, 8);
  const find = (player: string, week: number) => rows.find(row => row.player === player && row.week === week);
  assert.deepEqual(find('Test Quarterback', 2), { season: 2026, league: 'Premier', week: 2, team: 'Jason', player: 'Test Quarterback', position: 'QB', proTeam: 'KC', slot: 'QB', starter: 1, points: 20.5, status: 'final' });
  assert.equal(find('Test Runner', 2)!.points, null);
  assert.equal(find('Test Receiver', 3)!.starter, 0);
  assert.equal(find('Test Receiver', 3)!.slot, 'BE');
  assert.equal(find('Test Receiver', 3)!.status, 'live');
  assert.equal(find('Test Receiver', 2)!.starter, null);
  assert.equal(find('Test Receiver', 2)!.slot, null);
  assert.equal(find('Test Quarterback', 1)!.points, 18);
  assert.equal(rows.filter(row => row.player === 'Test Quarterback' && row.week === 2).length, 1);
  const dst = find('Test D/ST', 3)!;
  assert.equal(dst.team, 'Donna');
  assert.equal(dst.points, null);
  assert.equal(dst.starter, 1);
});
